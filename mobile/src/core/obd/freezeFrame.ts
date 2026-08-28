/**
 * Real freeze frame — Mode 02.
 *
 * The ECU snapshots engine conditions at the instant a fault set the MIL. That
 * is a different thing from the live values at scan time, which is what this
 * screen used to show.
 *
 * Request:  02 <PID> <frame>
 * Response: 42 <PID> <frame> <data...>
 *
 * Note the extra frame-number byte, which the Mode 01 path does not have — the
 * generic extractDataBytes would silently take the frame number as the first
 * data byte and every value would be wrong.
 */

export interface FreezeFrameValues {
  /** The DTC that triggered this frame, from PID 02. */
  triggerCode?: string;
  rpm?: number;
  speedKmh?: number;
  coolantC?: number;
  engineLoadPct?: number;
  throttlePct?: number;
  intakeAirC?: number;
  mapKpa?: number;
  mafGs?: number;
  fuelTrimShortPct?: number;
  fuelTrimLongPct?: number;
}

function isHexDigit(c: string): boolean {
  return /^[0-9A-Fa-f]$/.test(c);
}

/**
 * Splits one reply line into bytes.
 *
 * Spaced replies are read token by token, keeping only two-digit tokens: an
 * 11-bit CAN header like "7E8" is three hex digits, and concatenating it with
 * the rest would shift every subsequent byte by half a byte.
 */
function toBytes(line: string): number[] {
  const tokens = line.split(/\s+/).filter(Boolean);
  const hexOnly = (s: string) => Array.from(s).filter(isHexDigit).join("");

  if (tokens.length > 1) {
    return tokens
      .map(hexOnly)
      .filter((t) => t.length === 2)
      .map((t) => parseInt(t, 16));
  }

  const hex = hexOnly(tokens[0] ?? "");
  const bytes: number[] = [];
  for (let i = 0; i + 1 < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  return bytes;
}

/** Extracts the data bytes of a Mode 02 reply for one PID, skipping the mode
 * echo (0x42), the PID and the frame number. Returns undefined when the reply
 * is for a different PID, is NO DATA, or is too short. */
export function extractFreezeFrameBytes(
  response: string,
  pid: number,
  byteCount: number,
  frame = 0
): number[] | undefined {
  const upper = response.toUpperCase();
  if (upper.includes("NO DATA") || upper.includes("UNABLE TO CONNECT")) return undefined;

  for (const rawLine of upper.replace(/\r/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line || line === ">" || line.startsWith("SEARCHING") || line.startsWith("OK")) continue;

    const bytes = toBytes(line);

    // The reply may be preceded by a CAN header, so scan for the 42/PID/frame
    // triple rather than assuming it starts at index 0.
    for (let i = 0; i + 2 < bytes.length; i++) {
      if (bytes[i] === 0x42 && bytes[i + 1] === pid && bytes[i + 2] === frame) {
        const data = bytes.slice(i + 3, i + 3 + byteCount);
        if (data.length === byteCount) return data;
      }
    }
  }
  return undefined;
}

/** Decodes the DTC in freeze-frame PID 02 (same two-byte encoding as Mode 03). */
export function decodeFreezeFrameDTC(bytes: number[]): string | undefined {
  if (bytes.length < 2) return undefined;
  const [a, b] = bytes as [number, number];
  if (a === 0 && b === 0) return undefined;
  const letters = ["P", "C", "B", "U"];
  const type = (a & 0xc0) >> 6;
  const d1 = (a & 0x30) >> 4;
  const d2 = a & 0x0f;
  const d3 = (b & 0xf0) >> 4;
  const d4 = b & 0x0f;
  return `${letters[type]}${d1.toString(16)}${d2.toString(16)}${d3.toString(16)}${d4.toString(16)}`.toUpperCase();
}

export interface FreezeFramePID {
  pid: number;
  byteCount: number;
  apply: (bytes: number[], out: FreezeFrameValues) => void;
}

/** The frame contents worth showing, in the order a mechanic reads them. */
export const FREEZE_FRAME_PIDS: FreezeFramePID[] = [
  { pid: 0x02, byteCount: 2, apply: (b, o) => void (o.triggerCode = decodeFreezeFrameDTC(b)) },
  { pid: 0x04, byteCount: 1, apply: (b, o) => void (o.engineLoadPct = (b[0]! * 100) / 255) },
  { pid: 0x05, byteCount: 1, apply: (b, o) => void (o.coolantC = b[0]! - 40) },
  { pid: 0x06, byteCount: 1, apply: (b, o) => void (o.fuelTrimShortPct = (b[0]! - 128) * (100 / 128)) },
  { pid: 0x07, byteCount: 1, apply: (b, o) => void (o.fuelTrimLongPct = (b[0]! - 128) * (100 / 128)) },
  { pid: 0x0b, byteCount: 1, apply: (b, o) => void (o.mapKpa = b[0]!) },
  { pid: 0x0c, byteCount: 2, apply: (b, o) => void (o.rpm = (b[0]! * 256 + b[1]!) / 4) },
  { pid: 0x0d, byteCount: 1, apply: (b, o) => void (o.speedKmh = b[0]!) },
  { pid: 0x0f, byteCount: 1, apply: (b, o) => void (o.intakeAirC = b[0]! - 40) },
  { pid: 0x10, byteCount: 2, apply: (b, o) => void (o.mafGs = (b[0]! * 256 + b[1]!) / 100) },
  { pid: 0x11, byteCount: 1, apply: (b, o) => void (o.throttlePct = (b[0]! * 100) / 255) },
];

export function freezeFrameCommand(pid: number, frame = 0): string {
  const p = pid.toString(16).toUpperCase().padStart(2, "0");
  const f = frame.toString(16).toUpperCase().padStart(2, "0");
  return `02${p}${f}`;
}

export function hasAnyValue(values: FreezeFrameValues): boolean {
  return Object.values(values).some((v) => v != null);
}
