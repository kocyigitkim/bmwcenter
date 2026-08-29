export interface DTCCatalogEntry {
  code: string;
  en: string;
  tr: string;
  severity: string;
  system: string;
  systemKey: string;
  titleKey: string;
  bmw: boolean;
}

type RawEntry = Omit<DTCCatalogEntry, "code">;
type RawCatalog = Record<string, RawEntry>;

let cached: RawCatalog | undefined;

/**
 * The catalog on first use rather than at startup.
 *
 * DTCCatalog.json is about 3 MB. A top-level import makes Metro evaluate and
 * parse the whole thing while the app is launching, even though nothing needs
 * it until the user runs a scan or opens a code — most sessions never do.
 * Requiring it here moves that cost to the screen that actually wants it, and
 * the result is kept so the parse happens at most once.
 */
function catalog(): RawCatalog {
  if (!cached) {
    cached = require("../../data/DTCCatalog.json") as RawCatalog;
  }
  return cached;
}

export function entryFor(code: string): DTCCatalogEntry | undefined {
  const upper = code.toUpperCase();
  const raw = catalog()[upper];
  if (!raw) return undefined;
  return { code: upper, ...raw };
}

export function summaryFor(code: string, languageCode: string): string | undefined {
  const entry = catalog()[code.toUpperCase()];
  if (!entry) return undefined;
  return languageCode === "tr" ? entry.tr : entry.en;
}

export function allEntries(languageCode: string): Array<{ code: string; summary: string; severity: string; bmw: boolean }> {
  return Object.entries(catalog()).map(([code, entry]) => ({
    code,
    summary: languageCode === "tr" ? entry.tr : entry.en,
    severity: entry.severity,
    bmw: entry.bmw,
  }));
}

export function bmwEntries(languageCode: string) {
  return allEntries(languageCode).filter((e) => e.bmw);
}
