/**
 * Reading and writing the backup file.
 *
 * The database is dumped table by table through raw SQL rather than through
 * drizzle, so a table added later is included without anyone remembering to
 * list it here — the point of a backup is that it does not quietly omit the
 * thing you needed.
 */

import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { sqlite } from "../storage/db";
import { storage, useAppSettings } from "../settings/appSettings";
import {
  alignRow,
  backupFileName,
  buildBackup,
  parseBackup,
  rowsToInsert,
  serializeBackup,
  type BackupPayload,
  type BackupProblem,
  type BackupTables,
} from "./backupFormat";

/** SQLite's own bookkeeping is not ours to restore. */
const SKIP_TABLES = new Set(["sqlite_sequence", "sqlite_stat1", "android_metadata"]);

/** Settings whose value describes this handset, not the user's preferences. */
const DEVICE_LOCAL_SETTINGS = new Set(["settings.lastAdapterId", "settings.lastAdapterName"]);

export type RestoreMode = "merge" | "replace";

export interface RestoreOutcome {
  ok: boolean;
  problem?: BackupProblem | "cancelled" | "failed";
  inserted?: number;
  skipped?: number;
}

function tableNames(): string[] {
  const rows = sqlite.getAllSync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table';"
  );
  return rows.map((r) => r.name).filter((name) => !SKIP_TABLES.has(name) && !name.startsWith("sqlite_"));
}

function columnsOf(table: string): Set<string> {
  const rows = sqlite.getAllSync<{ name: string }>(`PRAGMA table_info(${table});`);
  return new Set(rows.map((r) => r.name));
}

/** The primary key, or the whole row when the table has none. */
function keyColumnsOf(table: string): string[] {
  const rows = sqlite.getAllSync<{ name: string; pk: number }>(`PRAGMA table_info(${table});`);
  const pk = rows.filter((r) => r.pk > 0).map((r) => r.name);
  return pk.length > 0 ? pk : rows.map((r) => r.name);
}

function keyOf(row: Record<string, unknown>, columns: string[]): string | undefined {
  const parts = columns.map((c) => row[c]);
  if (parts.some((p) => p === undefined)) return undefined;
  return parts.map((p) => JSON.stringify(p)).join(" ");
}

function collectSettings(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of storage.getAllKeys()) {
    // Pairing details belong to the phone that did the pairing.
    if (DEVICE_LOCAL_SETTINGS.has(key)) continue;
    const value = storage.getString(key);
    if (value != null) out[key] = value;
  }
  return out;
}

export function collectBackup(now = Date.now()): BackupPayload {
  const tables: BackupTables = {};
  for (const table of tableNames()) {
    try {
      tables[table] = sqlite.getAllSync<Record<string, unknown>>(`SELECT * FROM ${table};`);
    } catch {
      // A table that cannot be read must not take the whole backup with it.
    }
  }
  return buildBackup({
    createdAt: now,
    app: {
      version: Constants.expoConfig?.version ?? undefined,
      platform: Platform.OS,
    },
    settings: collectSettings(),
    tables,
  });
}

/** Writes the backup and hands it to the share sheet. Returns the file's uri. */
export async function exportBackup(now = Date.now()): Promise<string | undefined> {
  try {
    const payload = collectBackup(now);
    const file = new File(Paths.cache, backupFileName(now));
    file.create({ overwrite: true });
    file.write(serializeBackup(payload));
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        mimeType: "application/json",
        dialogTitle: "QuickCar backup",
        UTI: "public.json",
      });
    }
    return file.uri;
  } catch {
    return undefined;
  }
}

/** Lets the user pick a backup file and reads it, without touching the database. */
export async function pickBackup(): Promise<
  { ok: true; payload: BackupPayload } | { ok: false; problem: BackupProblem | "cancelled" | "failed" }
> {
  let file: File;
  try {
    // Some providers hand a .json file back as octet-stream, so the filter stays
    // wide and parseBackup does the real checking.
    const picked = await File.pickFileAsync({
      mimeTypes: ["application/json", "text/plain", "application/octet-stream"],
    });
    if (picked.canceled || !picked.result) return { ok: false, problem: "cancelled" };
    file = picked.result;
  } catch {
    return { ok: false, problem: "failed" };
  }

  try {
    const parsed = parseBackup(await file.text());
    return parsed.ok ? { ok: true, payload: parsed.payload } : { ok: false, problem: parsed.problem };
  } catch {
    return { ok: false, problem: "failed" };
  }
}

/**
 * Writes a parsed backup into the database.
 *
 * `merge` adds what is missing and leaves what is present alone, so restoring
 * onto a phone that has kept driving does not undo the last month. `replace`
 * empties each table the backup carries first, which is what someone moving to
 * a new handset means by "restore".
 *
 * The whole thing runs in one transaction: a restore that fails halfway would
 * leave a database that is neither the old one nor the backup.
 */
export function applyBackup(payload: BackupPayload, mode: RestoreMode): RestoreOutcome {
  let inserted = 0;
  let skipped = 0;

  try {
    const present = new Set(tableNames());
    sqlite.execSync("BEGIN TRANSACTION;");
    try {
      for (const [table, rows] of Object.entries(payload.tables)) {
        // A table this build does not have is from a newer schema; its rows have
        // nowhere to go, and inventing one would be worse than saying nothing.
        if (!present.has(table)) {
          skipped += rows.length;
          continue;
        }
        const columns = columnsOf(table);
        const keyColumns = keyColumnsOf(table).filter((c) => columns.has(c));

        if (mode === "replace") sqlite.execSync(`DELETE FROM ${table};`);

        const existingKeys = new Set<string>();
        if (mode === "merge" && keyColumns.length > 0) {
          for (const row of sqlite.getAllSync<Record<string, unknown>>(
            `SELECT ${keyColumns.join(", ")} FROM ${table};`
          )) {
            const key = keyOf(row, keyColumns);
            if (key != null) existingKeys.add(key);
          }
        }

        const aligned = rows.map((row) => alignRow(row, columns));
        const fresh =
          keyColumns.length > 0
            ? rowsToInsert(aligned, existingKeys, (row) => keyOf(row, keyColumns))
            : aligned;
        skipped += aligned.length - fresh.length;

        for (const row of fresh) {
          const names = Object.keys(row);
          if (names.length === 0) continue;
          const placeholders = names.map(() => "?").join(", ");
          sqlite.runSync(
            `INSERT OR IGNORE INTO ${table} (${names.join(", ")}) VALUES (${placeholders});`,
            names.map((n) => row[n] as never)
          );
          inserted += 1;
        }
      }
      sqlite.execSync("COMMIT;");
    } catch (error) {
      sqlite.execSync("ROLLBACK;");
      throw error;
    }
  } catch {
    return { ok: false, problem: "failed" };
  }

  restoreSettings(payload.settings);
  return { ok: true, inserted, skipped };
}

/** Settings live outside SQLite, so they are restored separately. */
function restoreSettings(settings: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(settings)) {
    if (DEVICE_LOCAL_SETTINGS.has(key)) continue;
    if (typeof value !== "string") continue;
    try {
      storage.set(key, value);
    } catch {
      // One unwritable key must not abandon the rest.
    }
  }
  // The store read its values at construction; without this the app keeps
  // showing the settings it started with until it is restarted.
  useAppSettings.getState().reload();
}
