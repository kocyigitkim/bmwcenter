import {
  alignRow,
  backupFileName,
  buildBackup,
  describeBackup,
  parseBackup,
  rowsToInsert,
  serializeBackup,
  BACKUP_VERSION,
} from "../backupFormat";

const NOW = Date.UTC(2026, 4, 17, 9, 5);

function sample() {
  return buildBackup({
    createdAt: NOW,
    app: { version: "1.0.0", platform: "android" },
    settings: { currencyCode: "TRY" },
    tables: {
      trips: [{ id: "t1", distanceKm: 12 }],
      refuel_entries: [{ id: "r1", liters: 40 }],
    },
  });
}

describe("round trip", () => {
  it("reads back what it wrote", () => {
    const parsed = parseBackup(serializeBackup(sample()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.payload.createdAt).toBe(NOW);
    expect(parsed.payload.settings).toEqual({ currencyCode: "TRY" });
    expect(parsed.payload.tables.trips).toEqual([{ id: "t1", distanceKm: 12 }]);
  });
});

describe("parseBackup", () => {
  it("rejects a file that is not JSON at all", () => {
    expect(parseBackup("not a backup")).toEqual({ ok: false, problem: "notJSON" });
    expect(parseBackup("")).toEqual({ ok: false, problem: "notJSON" });
  });

  it("rejects valid JSON that is somebody else's file", () => {
    expect(parseBackup('{"hello":"world"}')).toEqual({ ok: false, problem: "notABackup" });
    expect(parseBackup("[1,2,3]")).toEqual({ ok: false, problem: "notABackup" });
    expect(parseBackup("null")).toEqual({ ok: false, problem: "notABackup" });
  });

  it("refuses a backup written by a newer version rather than restoring part of it", () => {
    const future = { ...sample(), version: BACKUP_VERSION + 1 };
    expect(parseBackup(JSON.stringify(future))).toEqual({ ok: false, problem: "tooNew" });
  });

  it("accepts a backup from an older version", () => {
    const old = { ...sample(), version: 0 };
    expect(parseBackup(JSON.stringify(old)).ok).toBe(true);
  });

  it("rejects a backup with no tables to restore", () => {
    expect(parseBackup(JSON.stringify({ ...sample(), tables: {} }))).toEqual({
      ok: false,
      problem: "noTables",
    });
    expect(parseBackup(JSON.stringify({ ...sample(), tables: null }))).toEqual({
      ok: false,
      problem: "noTables",
    });
  });

  it("drops junk entries instead of failing the whole file", () => {
    const messy = {
      ...sample(),
      tables: { trips: [{ id: "t1" }, null, 42, "x"], notAnArray: 5 },
    };
    const parsed = parseBackup(JSON.stringify(messy));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.payload.tables.trips).toEqual([{ id: "t1" }]);
    expect(parsed.payload.tables.notAnArray).toBeUndefined();
  });

  it("survives missing optional sections", () => {
    const bare = { format: "quickcar.backup", version: 1, tables: { trips: [{ id: "a" }] } };
    const parsed = parseBackup(JSON.stringify(bare));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.payload.settings).toEqual({});
    expect(parsed.payload.createdAt).toBe(0);
  });
});

describe("describeBackup", () => {
  it("summarises the largest tables first and hides empty ones", () => {
    const payload = buildBackup({
      createdAt: NOW,
      app: {},
      settings: {},
      tables: { trips: [{}, {}, {}], dtc_records: [{}], crank_records: [] },
    });
    expect(describeBackup(payload)).toEqual([
      { table: "trips", rows: 3 },
      { table: "dtc_records", rows: 1 },
    ]);
  });
});

describe("alignRow", () => {
  it("drops columns this build's schema does not have", () => {
    const columns = new Set(["id", "distanceKm"]);
    expect(alignRow({ id: "t1", distanceKm: 4, futureColumn: true }, columns)).toEqual({
      id: "t1",
      distanceKm: 4,
    });
  });

  it("keeps a null value rather than treating it as missing", () => {
    const columns = new Set(["id", "note"]);
    expect(alignRow({ id: "t1", note: null }, columns)).toEqual({ id: "t1", note: null });
  });
});

describe("rowsToInsert", () => {
  const keyOf = (row: Record<string, unknown>) =>
    typeof row.id === "string" ? row.id : undefined;

  it("leaves rows the phone already has alone", () => {
    const out = rowsToInsert([{ id: "a" }, { id: "b" }], new Set(["a"]), keyOf);
    expect(out).toEqual([{ id: "b" }]);
  });

  it("does not insert the same row twice from one file", () => {
    const out = rowsToInsert([{ id: "a" }, { id: "a" }], new Set(), keyOf);
    expect(out).toEqual([{ id: "a" }]);
  });

  it("drops rows with no usable key, which would duplicate on every restore", () => {
    const out = rowsToInsert([{ id: "" }, { nope: 1 }, { id: "c" }], new Set(), keyOf);
    expect(out).toEqual([{ id: "c" }]);
  });

  it("inserts everything into an empty database", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(rowsToInsert(rows, new Set(), keyOf)).toHaveLength(3);
  });
});

describe("backupFileName", () => {
  it("sorts chronologically and names itself", () => {
    const name = backupFileName(new Date(2026, 4, 17, 9, 5).getTime());
    expect(name).toBe("quickcar-20260517-0905.quickcar.json");
  });

  it("pads single-digit parts so names sort as text", () => {
    const early = backupFileName(new Date(2026, 0, 2, 3, 4).getTime());
    const later = backupFileName(new Date(2026, 10, 20, 13, 40).getTime());
    expect(early < later).toBe(true);
  });
});
