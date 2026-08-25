import catalogData from "@/data/DTCCatalog.json";

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

const catalog = catalogData as Record<
  string,
  { en: string; tr: string; severity: string; system: string; systemKey: string; titleKey: string; bmw: boolean }
>;

export function entryFor(code: string): DTCCatalogEntry | undefined {
  const raw = catalog[code.toUpperCase()];
  if (!raw) return undefined;
  return { code: code.toUpperCase(), ...raw };
}

export function summaryFor(code: string, languageCode: string): string | undefined {
  const entry = catalog[code.toUpperCase()];
  if (!entry) return undefined;
  return languageCode === "tr" ? entry.tr : entry.en;
}

export function allEntries(languageCode: string): Array<{ code: string; summary: string; severity: string; bmw: boolean }> {
  return Object.entries(catalog).map(([code, entry]) => ({
    code,
    summary: languageCode === "tr" ? entry.tr : entry.en,
    severity: entry.severity,
    bmw: entry.bmw,
  }));
}

export function bmwEntries(languageCode: string) {
  return allEntries(languageCode).filter((e) => e.bmw);
}
