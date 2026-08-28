/**
 * Emissions monitor readiness — Mode 01 PID 01.
 *
 * This is what an inspection station checks: each on-board monitor must have
 * completed its self-test since the last DTC clear. Clearing codes resets them
 * all, which is why a car that "has no codes" can still fail inspection.
 *
 * Byte layout (SAE J1979):
 *   A: bit7 MIL on, bits 0-6 stored DTC count
 *   B: bits 0-2 continuous monitors supported, bits 4-6 the same monitors
 *      *incomplete*, bit 3 selects the engine type for C/D
 *   C: non-continuous monitors supported, D: those monitors incomplete
 */

export type EngineIgnition = "spark" | "compression";

export interface MonitorStatus {
  /** i18n key under obd.monitor.* */
  key: string;
  supported: boolean;
  /** True once the monitor has run its self-test. Meaningless when unsupported. */
  complete: boolean;
}

export interface ReadinessStatus {
  milOn: boolean;
  dtcCount: number;
  ignition: EngineIgnition;
  monitors: MonitorStatus[];
  /** Monitors that are supported but have not completed. */
  incompleteCount: number;
  /** True when every supported monitor has completed — inspection-ready. */
  isReady: boolean;
}

const CONTINUOUS = ["misfire", "fuelSystem", "components"] as const;

/** Bit position -> monitor, for the non-continuous set. Index is the bit in C/D. */
const SPARK_MONITORS = [
  "catalyst",
  "heatedCatalyst",
  "evapSystem",
  "secondaryAir",
  "acRefrigerant",
  "oxygenSensor",
  "oxygenSensorHeater",
  "egr",
] as const;

const COMPRESSION_MONITORS = [
  "nmhcCatalyst",
  "noxScr",
  "reserved",
  "boostPressure",
  "reserved",
  "exhaustGasSensor",
  "pmFilter",
  "egrVvt",
] as const;

export function parseReadiness(bytes: number[]): ReadinessStatus | undefined {
  if (bytes.length < 4) return undefined;
  const [a, b, c, d] = bytes as [number, number, number, number];

  const ignition: EngineIgnition = (b & 0x08) !== 0 ? "compression" : "spark";
  const monitors: MonitorStatus[] = [];

  CONTINUOUS.forEach((key, i) => {
    monitors.push({
      key,
      supported: (b & (1 << i)) !== 0,
      // The readiness bits are inverted: 1 means *not* complete.
      complete: (b & (1 << (i + 4))) === 0,
    });
  });

  const names = ignition === "compression" ? COMPRESSION_MONITORS : SPARK_MONITORS;
  names.forEach((key, i) => {
    if (key === "reserved") return;
    monitors.push({
      key,
      supported: (c & (1 << i)) !== 0,
      complete: (d & (1 << i)) === 0,
    });
  });

  const incompleteCount = monitors.filter((m) => m.supported && !m.complete).length;

  return {
    milOn: (a & 0x80) !== 0,
    dtcCount: a & 0x7f,
    ignition,
    monitors,
    incompleteCount,
    isReady: incompleteCount === 0,
  };
}

/**
 * Most inspection regimes tolerate a small number of incomplete monitors after a
 * battery disconnect or code clear. Two is the common allowance for OBD-II
 * petrol cars (one for older model years), so this is guidance, not a verdict.
 */
export function readinessVerdict(status: ReadinessStatus): "ready" | "almost" | "notReady" {
  if (status.milOn) return "notReady";
  if (status.incompleteCount === 0) return "ready";
  if (status.incompleteCount <= 2) return "almost";
  return "notReady";
}
