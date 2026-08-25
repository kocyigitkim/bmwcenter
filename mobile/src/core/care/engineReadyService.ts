import type { VehicleSnapshot } from "../obd/vehicleSnapshot";
import type { CareCue, CareContext } from "./careTypes";
import type { CareFeature } from "./careFeature";

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

export function computeReadiness(coolantC: number, oilC: number, ambientC: number, runtimeS: number, avgLoad3min: number): number {
  const coolDenom = Math.max(88 - ambientC, 1);
  const oilDenom = Math.max(90 - ambientC, 1);
  const coolantProgress = clamp((coolantC - ambientC) / coolDenom, 0, 1);
  const oilProgress = clamp((oilC - ambientC) / oilDenom, 0, 1);
  const runtimeProgress = clamp(runtimeS / 480, 0, 1);
  const loadProgress = clamp(avgLoad3min / 45, 0, 1);
  return 0.45 * coolantProgress + 0.4 * oilProgress + 0.1 * runtimeProgress + 0.05 * loadProgress;
}

/** Gates the accel test and reports a live "engine ready" readiness fraction. */
class EngineReadyService implements CareFeature {
  id = "engineReady";

  readiness = 0;
  isReady = false;
  remainingLabel: string | undefined;

  private loadHistory: Array<{ t: number; load: number }> = [];
  private celebrated = false;

  isEnabled(): boolean {
    return true;
  }

  evaluate(snapshot: VehicleSnapshot, context: CareContext): CareCue[] {
    const ambient = context.ambientC ?? snapshot.ambientC ?? 15;
    const coolant = snapshot.coolantC ?? ambient;
    const oil = context.oilTempC ?? coolant;
    const runtime = snapshot.runtimeS ?? 0;
    const now = context.now;

    if (snapshot.engineLoadPct != null) {
      this.loadHistory.push({ t: now, load: snapshot.engineLoadPct });
      this.loadHistory = this.loadHistory.filter((s) => now - s.t <= 180_000);
    }
    const avgLoad = this.loadHistory.length ? this.loadHistory.reduce((a, s) => a + s.load, 0) / this.loadHistory.length : 0;

    let r = computeReadiness(coolant, oil, ambient, runtime, avgLoad);
    if (this.isReady) r = Math.max(r, 0.98);
    this.readiness = r;
    context.engineReady = r >= 0.98;

    const cues: CareCue[] = [];
    if (r >= 0.98) {
      this.isReady = true;
      this.remainingLabel = "Engine ready";
      if (!this.celebrated) {
        this.celebrated = true;
        cues.push({ id: "ready.reached", text: "Engine is fully warmed up.", severity: "celebration" });
      }
    } else {
      const remainingFrac = Math.max(0, 1 - r);
      const remainingS = remainingFrac * Math.max(60, 480 - runtime);
      const mins = Math.max(1, Math.ceil(remainingS / 60));
      this.remainingLabel = `~${mins} min to fully warm`;
    }
    return cues;
  }

  resetTrip(): void {
    this.readiness = 0;
    this.isReady = false;
    this.remainingLabel = undefined;
    this.loadHistory = [];
    this.celebrated = false;
  }
}

export const engineReadyService = new EngineReadyService();
