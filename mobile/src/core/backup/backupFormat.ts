/**
 * The backup file format.
 *
 * Everything the app knows lives in one SQLite file on one phone. A lost or
 * replaced handset takes years of trips, fuel logs, trouble codes and — most
 * painfully — calibration with it, none of which can be reconstructed.
 *
 * The file is plain JSON rather than a copy of the database, so a backup taken
 * today still restores after the schema has moved on: unknown tables and
 * columns are carried or dropped deliberately instead of failing to open.
 *
 * Parsing is separate from any database access so the validation can be tested
 * against the malformed, truncated and foreign files people will inevitably
 * pick.
 */

export const BACKUP_MARKER = "quickcar.backup";
/** Raised only for a change that older readers must refuse. */
export const BACKUP_VERSION = 1;

export type BackupTables = Record<string, Array<Record<string, unknown>>>;

export interface BackupPayload {
  format: typeof BACKUP_MARKER;
  version: number;
  createdAt: number;
  app: { version?: string; platform?: string };
  settings: Record<string, unknown>;
  tables: BackupTables;
}

export type BackupProblem =
  | "notJSON"
  | "notABackup"
  | "tooNew"
  | "noTables";

export type ParseResult =
  | { ok: true; payload: BackupPayload }
  | { ok: false; problem: BackupProblem };

export function buildBackup(input: {
  createdAt: number;
  app: BackupPayload["app"];
  settings: Record<string, unknown>;
  tables: BackupTables;
}): BackupPayload {
  return {
    format: BACKUP_MARKER,
    version: BACKUP_VERSION,
    createdAt: input.createdAt,
    app: input.app,
    settings: input.settings,
    tables: input.tables,
  };
}

export function serializeBackup(payload: BackupPayload): string {
  return JSON.stringify(payload);
}

export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, problem: "notJSON" };
  }

  if (typeof raw !== "object" || raw === null) return { ok: false, problem: "notABackup" };
  const candidate = raw as Partial<BackupPayload>;
  if (candidate.format !== BACKUP_MARKER) return { ok: false, problem: "notABackup" };

  const version = typeof candidate.version === "number" ? candidate.version : 0;
  // A file from a newer app may describe rows this build cannot place. Refusing
  // is the honest outcome; a partial restore that looks complete is worse.
  if (version > BACKUP_VERSION) return { ok: false, problem: "tooNew" };

  const tables = candidate.tables;
  if (typeof tables !== "object" || tables === null) return { ok: false, problem: "noTables" };

  const clean: BackupTables = {};
  for (const [name, rows] of Object.entries(tables)) {
    if (!Array.isArray(rows)) continue;
    clean[name] = rows.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null);
  }
  if (Object.keys(clean).length === 0) return { ok: false, problem: "noTables" };

  return {
    ok: true,
    payload: {
      format: BACKUP_MARKER,
      version,
      createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : 0,
      app: (candidate.app as BackupPayload["app"]) ?? {},
      settings:
        typeof candidate.settings === "object" && candidate.settings !== null
          ? (candidate.settings as Record<string, unknown>)
          : {},
      tables: clean,
    },
  };
}

/** Row counts per table, for the "what am I about to restore" confirmation. */
export function describeBackup(payload: BackupPayload): Array<{ table: string; rows: number }> {
  return Object.entries(payload.tables)
    .map(([table, rows]) => ({ table, rows: rows.length }))
    .filter((entry) => entry.rows > 0)
    .sort((a, b) => b.rows - a.rows);
}

/**
 * Drops columns the current schema does not have.
 *
 * A backup from a newer minor build can carry columns this one never created;
 * passing them to an INSERT fails the whole table. Silently dropping them
 * restores everything else, which is what the user actually wants.
 */
export function alignRow(
  row: Record<string, unknown>,
  columns: ReadonlySet<string>
): Record<string, unknown> {
  const aligned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (columns.has(key)) aligned[key] = value;
  }
  return aligned;
}

/**
 * Rows from the backup that are not already present.
 *
 * Merging is by primary key. A row the phone already has is left alone rather
 * than overwritten: the copy on the device has been through migrations the
 * backup's has not.
 */
export function rowsToInsert(
  incoming: Array<Record<string, unknown>>,
  existingKeys: ReadonlySet<string>,
  keyOf: (row: Record<string, unknown>) => string | undefined
): Array<Record<string, unknown>> {
  const seen = new Set(existingKeys);
  const out: Array<Record<string, unknown>> = [];
  for (const row of incoming) {
    const key = keyOf(row);
    // A row with no usable key cannot be deduplicated, so it is dropped rather
    // than inserted repeatedly on every restore.
    if (key == null || key === "") continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/** Filename that sorts chronologically and says what it is. */
export function backupFileName(createdAt: number): string {
  const d = new Date(createdAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `quickcar-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.quickcar.json`;
}
