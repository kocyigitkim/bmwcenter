import type { DTC, DTCStatus } from "./vehicleSnapshot";

export type OBDFrameParseResult =
  | { kind: "value"; bytes: number[] }
  | { kind: "noData" }
  | { kind: "retry" }
  | { kind: "badResponse"; raw: string }
  | { kind: "disconnected" };

function isHexDigit(c: string): boolean {
  return /^[0-9A-Fa-f]$/.test(c);
}

function filterHex(s: string): string {
  return Array.from(s)
    .filter(isHexDigit)
    .join("");
}

/**
 * @param sentCommand the command that was written to the adapter, if known. When
 *   provided, a response line that is just an echo of that command (e.g. echo
 *   wasn't successfully disabled via ATE0) is filtered out before data extraction,
 *   same as the other adapter noise lines below.
 */
export function parse(
  response: string,
  expectedPID: number,
  byteCount: number,
  sentCommand?: string
): OBDFrameParseResult {
  const upper = response.toUpperCase();
  if (upper.includes("UNABLE TO CONNECT")) return { kind: "disconnected" };
  if (upper.includes("NO DATA")) return { kind: "noData" };
  if (upper.trim() === "?") return { kind: "badResponse", raw: "?" };
  if (upper.includes("STOPPED") || upper.includes("CAN ERROR") || upper.includes("BUFFER FULL")) {
    return { kind: "retry" };
  }

  const echo = sentCommand?.toUpperCase().trim();
  const lines = upper
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("SEARCHING") && l !== ">" && !l.startsWith("OK") && l !== echo);

  for (const line of lines) {
    const bytes = extractDataBytes(line, expectedPID, byteCount);
    if (bytes) return { kind: "value", bytes };
  }
  return { kind: "badResponse", raw: response };
}

export function extractDataBytes(line: string, expectedPID: number, byteCount: number): number[] | undefined {
  // Prefer space-separated tokens (handles 11-bit CAN IDs like "7E8")
  const tokens = line.split(/\s+/).filter(Boolean);
  let bytes: number[] = [];
  if (tokens.length >= 2 && tokens.some((t) => t.length === 1 || t.length === 2)) {
    for (const token of tokens) {
      const t = filterHex(token);
      if (!t) continue;
      if (t.length === 3) {
        // 11-bit CAN header — keep low byte for scanning continuity
        const hi = parseInt(t.slice(0, 1), 16);
        const lo = parseInt(t.slice(1, 3), 16);
        if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
          bytes.push(hi, lo);
        }
        continue;
      }
      if (t.length % 2 === 1) continue;
      for (let i = 0; i < t.length; i += 2) {
        const b = parseInt(t.slice(i, i + 2), 16);
        if (!Number.isNaN(b)) bytes.push(b);
      }
    }
  }
  if (bytes.length < 2 + byteCount) {
    const hex = filterHex(line);
    if (hex.length < 2 + byteCount * 2) return undefined;
    // Drop leading nibble if odd length (common with 7E8… concatenated)
    const startOffset = hex.length % 2;
    bytes = [];
    let idx = startOffset;
    while (idx < hex.length) {
      const next = Math.min(idx + 2, hex.length);
      if (next - idx !== 2) break;
      const b = parseInt(hex.slice(idx, next), 16);
      if (Number.isNaN(b)) break;
      bytes.push(b);
      idx = next;
    }
  }
  if (bytes.length < 2 + byteCount) return undefined;

  // Find 41 (mode 01 + 0x40) then PID
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x41 && i + 1 < bytes.length && bytes[i + 1] === expectedPID) {
      const start = i + 2;
      const end = start + byteCount;
      if (end > bytes.length) return undefined;
      return bytes.slice(start, end);
    }
  }
  return undefined;
}

/** Mode 22 positive response: `62 <DID_H> <DID_L> <data…>`
 * Handles spaced frames, CAN id `7E8`, and ISO-TP length prefixes. */
export function parseMode22(response: string, did: number): number[] | undefined {
  const upper = response.toUpperCase();
  if (upper.includes("NO DATA") || upper.includes("UNABLE TO CONNECT")) return undefined;
  if (upper.trim() === "?") return undefined;

  const didHi = (did >> 8) & 0xff;
  const didLo = did & 0xff;

  const lines = upper
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("SEARCHING") && l !== ">" && !l.startsWith("OK"));

  for (const line of lines) {
    // Strip ISO-TP continuum prefixes: "0:", "1:", "014:" etc.
    let work = line;
    const colonIdx = work.indexOf(":");
    if (colonIdx >= 0) {
      const head = filterHex(work.slice(0, colonIdx));
      if (head.length > 0 && head.length <= 3) {
        work = work.slice(colonIdx + 1).trim();
      }
    }
    const tokens = work.split(/\s+/).filter(Boolean);
    const bytes: number[] = [];
    for (const token of tokens) {
      let t = filterHex(token);
      if (!t) continue;
      // Only skip real 11-bit ECU addresses (7E0–7EF), not ISO-TP lengths like 00A/014.
      if (t.length === 3 && t.startsWith("7E")) continue;
      if (t.length % 2 === 1) {
        // Odd length: keep as nibble-pairs from the right if long enough, else skip.
        if (t.length < 3) continue;
      }
      const hexPairs = t.length % 2 === 1 ? t.slice(1) : t;
      for (let i = 0; i < hexPairs.length; i += 2) {
        const b = parseInt(hexPairs.slice(i, i + 2), 16);
        if (!Number.isNaN(b)) bytes.push(b);
      }
    }
    const data = mode22Payload(bytes, didHi, didLo);
    if (data) return data;
  }

  // Fallback: continuous hex, scan for 62 DID anywhere (skip leading odd nibble).
  const hex = filterHex(upper);
  if (hex.length < 8) return undefined;
  for (let start = 0; start <= 1; start++) {
    const bytes: number[] = [];
    let idx = start;
    while (hex.length - idx >= 2) {
      const b = parseInt(hex.slice(idx, idx + 2), 16);
      if (Number.isNaN(b)) break;
      bytes.push(b);
      idx += 2;
    }
    const data = mode22Payload(bytes, didHi, didLo);
    if (data) return data;
  }
  return undefined;
}

function mode22Payload(bytes: number[], didHi: number, didLo: number): number[] | undefined {
  if (bytes.length < 3) return undefined;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x62 && i + 2 < bytes.length && bytes[i + 1] === didHi && bytes[i + 2] === didLo) {
      return bytes.slice(i + 3);
    }
  }
  return undefined;
}

/** BMW F30/N13 MEVD1725 oil temp — Mode 22 DID `D3B0`: °C = A − 40. */
export function bmwOilTempC(bytes: number[]): number | undefined {
  const a = bytes[0];
  if (a == null) return undefined;
  const celsius = a - 40;
  return celsius > -40 && celsius < 160 ? celsius : undefined;
}

/** Legacy Torque F20/N13 DID `4402`: `(A*256+B)*191.25/255-48`. */
export function bmwOilTempLegacy4402C(bytes: number[]): number | undefined {
  if (bytes.length < 2) {
    const a = bytes[0];
    if (a == null) return undefined;
    const alt = a - 40;
    return alt > -40 && alt < 160 ? alt : undefined;
  }
  const raw = bytes[0]! * 256 + bytes[1]!;
  const celsius = (raw * 191.25) / 255.0 - 48.0;
  return celsius > -40 && celsius < 160 ? celsius : undefined;
}

/** BMW N13 oil pressure (Mode 22 DID 586F). Byte A scales to absolute hPa; gauge bar vs atmosphere. */
export function bmwOilPressureBar(bytes: number[], ambientBaroKpa?: number): number | undefined {
  const a = bytes[0];
  if (a == null) return undefined;
  // Community calibration: A≈9 → ~1058 hPa absolute at rest.
  const absHpa = a * 117.556;
  const atmHpa = (ambientBaroKpa ?? 101.3) * 10.0;
  const gaugeBar = (absHpa - atmHpa) / 1000.0;
  return gaugeBar > -0.5 && gaugeBar < 10 ? gaugeBar : undefined;
}

/** @param status which service the reply came from — 03 stored, 07 pending, 0A permanent. */
export function parseDTCResponse(response: string, status: DTCStatus = "stored"): DTC[] {
  const upper = response.toUpperCase();
  if (upper.includes("NO DATA")) return [];
  const hex = filterHex(upper);
  if (hex.length < 2) return [];
  const bytes: number[] = [];
  let idx = 0;
  while (idx < hex.length) {
    const next = Math.min(idx + 2, hex.length);
    if (next - idx < 2) break;
    const b = parseInt(hex.slice(idx, next), 16);
    if (Number.isNaN(b)) break;
    bytes.push(b);
    idx = next;
  }

  // Skip mode echo 43 (stored), 47 (pending), 4A (permanent)
  let start = 0;
  for (const mode of [0x43, 0x47, 0x4a]) {
    const i = bytes.indexOf(mode);
    if (i >= 0) {
      start = i + 1;
      break;
    }
  }
  const codes: DTC[] = [];
  const letters = ["P", "C", "B", "U"];
  let i = start;
  const now = Date.now();
  while (i + 1 < bytes.length) {
    const a = bytes[i]!;
    const b = bytes[i + 1]!;
    i += 2;
    if (a === 0 && b === 0) continue;
    const type = (a & 0xc0) >> 6;
    const d1 = (a & 0x30) >> 4;
    const d2 = a & 0x0f;
    const d3 = (b & 0xf0) >> 4;
    const d4 = b & 0x0f;
    const code = `${letters[type]}${d1.toString(16)}${d2.toString(16)}${d3.toString(16)}${d4.toString(16)}`.toUpperCase();
    codes.push({ code, status, firstSeen: now });
  }
  return codes;
}

/** ISO-TP multi-frame VIN (Mode 09 PID 02). */
export function parseVIN(response: string): string | undefined {
  const upper = response.toUpperCase();
  const lines = upper
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l !== ">");

  let hex = "";
  for (const line of lines) {
    let s = line;
    const colon = s.indexOf(":");
    if (colon >= 0) s = s.slice(colon + 1);
    // Drop leading length nibble lines like "014"
    if (s.length === 3 && Array.from(s).every(isHexDigit)) continue;
    hex += filterHex(s);
  }
  if (hex.length < 6) return undefined;
  const bytes: number[] = [];
  let idx = 0;
  while (idx < hex.length) {
    const next = Math.min(idx + 2, hex.length);
    if (next - idx !== 2) break;
    const b = parseInt(hex.slice(idx, next), 16);
    if (Number.isNaN(b)) break;
    bytes.push(b);
    idx = next;
  }
  // Find 49 02 01 prefix
  const start = bytes.indexOf(0x49);
  if (start < 0 || start + 2 >= bytes.length || bytes[start + 1] !== 0x02) return undefined;
  const payloadStart = start + 3;
  if (payloadStart >= bytes.length) return undefined;
  const ascii = bytes
    .slice(payloadStart)
    .filter((b) => b >= 32 && b < 127)
    .map((b) => String.fromCharCode(b))
    .join("");
  const vin = ascii.replace(/[^A-Za-z0-9]/g, "");
  if (vin.length === 17) return vin;
  return vin.length >= 17 ? vin.slice(0, 17) : undefined;
}
