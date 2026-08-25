import type { VehicleSnapshot } from "./vehicleSnapshot";

export interface OBDPID {
  mode: number;
  pid: number;
  byteCount: number;
  key: string;
  parse: (bytes: number[]) => number | undefined;
}

function trim(b: number[]): number | undefined {
  const a = b[0];
  return a == null ? undefined : a / 1.28 - 100;
}

function pct(b: number[]): number | undefined {
  const a = b[0];
  return a == null ? undefined : (a * 100) / 255;
}

function temp(b: number[]): number | undefined {
  const a = b[0];
  return a == null ? undefined : a - 40;
}

export const OBDPIDCatalog = {
  engineLoad: { mode: 0x01, pid: 0x04, byteCount: 1, key: "engineLoad", parse: pct },
  coolant: { mode: 0x01, pid: 0x05, byteCount: 1, key: "coolant", parse: temp },
  stft1: { mode: 0x01, pid: 0x06, byteCount: 1, key: "stft1", parse: trim },
  ltft1: { mode: 0x01, pid: 0x07, byteCount: 1, key: "ltft1", parse: trim },
  stft2: { mode: 0x01, pid: 0x08, byteCount: 1, key: "stft2", parse: trim },
  ltft2: { mode: 0x01, pid: 0x09, byteCount: 1, key: "ltft2", parse: trim },
  fuelPressure: {
    mode: 0x01,
    pid: 0x0a,
    byteCount: 1,
    key: "fuelPressure",
    parse: (b: number[]) => (b[0] == null ? undefined : b[0] * 3),
  },
  map: {
    mode: 0x01,
    pid: 0x0b,
    byteCount: 1,
    key: "map",
    parse: (b: number[]) => (b[0] == null ? undefined : b[0]),
  },
  rpm: {
    mode: 0x01,
    pid: 0x0c,
    byteCount: 2,
    key: "rpm",
    parse: (b: number[]) => (b.length < 2 ? undefined : (b[0] * 256 + b[1]) / 4),
  },
  speed: {
    mode: 0x01,
    pid: 0x0d,
    byteCount: 1,
    key: "speed",
    parse: (b: number[]) => (b[0] == null ? undefined : b[0]),
  },
  timing: {
    mode: 0x01,
    pid: 0x0e,
    byteCount: 1,
    key: "timing",
    parse: (b: number[]) => (b[0] == null ? undefined : b[0] / 2 - 64),
  },
  intakeAir: { mode: 0x01, pid: 0x0f, byteCount: 1, key: "intakeAir", parse: temp },
  maf: {
    mode: 0x01,
    pid: 0x10,
    byteCount: 2,
    key: "maf",
    parse: (b: number[]) => (b.length < 2 ? undefined : (b[0] * 256 + b[1]) / 100),
  },
  throttle: { mode: 0x01, pid: 0x11, byteCount: 1, key: "throttle", parse: pct },
  runtime: {
    mode: 0x01,
    pid: 0x1f,
    byteCount: 2,
    key: "runtime",
    parse: (b: number[]) => (b.length < 2 ? undefined : b[0] * 256 + b[1]),
  },
  distMIL: {
    mode: 0x01,
    pid: 0x21,
    byteCount: 2,
    key: "distMIL",
    parse: (b: number[]) => (b.length < 2 ? undefined : b[0] * 256 + b[1]),
  },
  fuelRail: {
    mode: 0x01,
    pid: 0x23,
    byteCount: 2,
    key: "fuelRail",
    parse: (b: number[]) => (b.length < 2 ? undefined : (b[0] * 256 + b[1]) * 10),
  },
  egr: { mode: 0x01, pid: 0x2c, byteCount: 1, key: "egr", parse: pct },
  fuelLevel: { mode: 0x01, pid: 0x2f, byteCount: 1, key: "fuelLevel", parse: pct },
  distClear: {
    mode: 0x01,
    pid: 0x31,
    byteCount: 2,
    key: "distClear",
    parse: (b: number[]) => (b.length < 2 ? undefined : b[0] * 256 + b[1]),
  },
  baro: {
    mode: 0x01,
    pid: 0x33,
    byteCount: 1,
    key: "baro",
    parse: (b: number[]) => (b[0] == null ? undefined : b[0]),
  },
  catalyst: {
    mode: 0x01,
    pid: 0x3c,
    byteCount: 2,
    key: "catalyst",
    parse: (b: number[]) => (b.length < 2 ? undefined : (b[0] * 256 + b[1]) / 10 - 40),
  },
  voltage: {
    mode: 0x01,
    pid: 0x42,
    byteCount: 2,
    key: "voltage",
    parse: (b: number[]) => (b.length < 2 ? undefined : (b[0] * 256 + b[1]) / 1000),
  },
  relativeThrottle: { mode: 0x01, pid: 0x45, byteCount: 1, key: "relThrottle", parse: pct },
  ambient: { mode: 0x01, pid: 0x46, byteCount: 1, key: "ambient", parse: temp },
  pedal: { mode: 0x01, pid: 0x49, byteCount: 1, key: "pedal", parse: pct },
  oilTemp: { mode: 0x01, pid: 0x5c, byteCount: 1, key: "oilTemp", parse: temp },
  fuelRate: {
    mode: 0x01,
    pid: 0x5e,
    byteCount: 2,
    key: "fuelRate",
    parse: (b: number[]) => (b.length < 2 ? undefined : (b[0] * 256 + b[1]) / 20),
  },
} satisfies Record<string, OBDPID>;

export const allPIDs: OBDPID[] = Object.values(OBDPIDCatalog);

export function pidFor(value: number): OBDPID | undefined {
  return allPIDs.find((p) => p.pid === value);
}

export function applyPidValue(value: number, pid: number, snapshot: VehicleSnapshot): void {
  switch (pid) {
    case 0x04:
      snapshot.engineLoadPct = value;
      break;
    case 0x05:
      snapshot.coolantC = value;
      break;
    case 0x06:
      snapshot.stftBank1 = value;
      break;
    case 0x07:
      snapshot.ltftBank1 = value;
      break;
    case 0x08:
      snapshot.stftBank2 = value;
      break;
    case 0x09:
      snapshot.ltftBank2 = value;
      break;
    case 0x0b:
      snapshot.mapKpa = value;
      break;
    case 0x0c:
      snapshot.rpm = value;
      break;
    case 0x0d:
      snapshot.speedKmh = value;
      break;
    case 0x0e:
      snapshot.timingAdvance = value;
      break;
    case 0x0f:
      snapshot.intakeAirC = value;
      break;
    case 0x10:
      snapshot.mafGs = value;
      break;
    case 0x11:
      snapshot.throttlePct = value;
      break;
    case 0x1f:
      snapshot.runtimeS = value;
      break;
    case 0x21:
      snapshot.distanceWithMILKm = value;
      break;
    case 0x23:
      snapshot.fuelRailKpa = value;
      break;
    case 0x2f:
      snapshot.fuelLevelPct = value;
      break;
    case 0x31:
      snapshot.distanceSinceClearKm = value;
      break;
    case 0x33:
      snapshot.baroKpa = value;
      break;
    case 0x3c:
      snapshot.catalystC = value;
      break;
    case 0x42:
      snapshot.voltage = value;
      break;
    case 0x45:
      snapshot.throttlePct = value;
      break;
    case 0x46:
      snapshot.ambientC = value;
      break;
    case 0x49:
      snapshot.pedalPct = value;
      break;
    case 0x5c:
      snapshot.oilTempC = value;
      break;
    case 0x5e:
      snapshot.engineFuelRateLh = value;
      break;
    default:
      break;
  }
}

export function parseSupportedBitmask(bytes: number[], base: number): Set<number> {
  const result = new Set<number>();
  if (bytes.length < 4) return result;
  for (let i = 0; i < 4; i++) {
    const byte = bytes[i]!;
    for (let bit = 0; bit < 8; bit++) {
      if ((byte & (0x80 >> bit)) !== 0) {
        result.add(base + i * 8 + bit + 1);
      }
    }
  }
  return result;
}
