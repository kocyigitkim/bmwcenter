/** Estimates oil temperature from coolant + elapsed runtime when no oil-temp PID is available. */
export function estimateOilTempC(measured: number | undefined, coolant: number | undefined, ambient: number, runtimeS: number): number {
  if (measured != null) return measured;
  const coolantValue = coolant ?? ambient;
  let f: number;
  if (runtimeS < 0) f = 0;
  else if (runtimeS < 600) f = (runtimeS / 600) * 0.75;
  else if (runtimeS < 900) f = 0.75 + ((runtimeS - 600) / 300) * 0.15;
  else f = 0.9;
  return ambient + (coolantValue - ambient) * Math.min(Math.max(f, 0), 0.9);
}
