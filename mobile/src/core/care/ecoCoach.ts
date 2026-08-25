import type { VehicleSnapshot } from "../obd/vehicleSnapshot";
import type { CareCue, CareContext } from "./careTypes";
import type { CareFeature } from "./careFeature";

class EcoCoach implements CareFeature {
  id = "ecoCoach";

  liveScore = 100;

  private speedHistory: Array<{ t: number; v: number }> = [];
  private accelStreakStart: number | undefined;
  private highRevCruiseStart: number | undefined;
  private lastThrottleOpenAt: number | undefined;
  private overrunStart: number | undefined;
  private idleSince: number | undefined;
  private highSpeedSince: number | undefined;
  private stopCountWindow: number[] = [];
  private wasStopped = false;
  private scoreWindow: Array<{ t: number; delta: number }> = [];

  isEnabled(settings: { careEcoCoach: boolean }): boolean {
    return settings.careEcoCoach;
  }

  evaluate(snapshot: VehicleSnapshot, context: CareContext): CareCue[] {
    if (context.isColdPhase) {
      context.liveEcoScore = this.liveScore;
      return [];
    }

    const now = context.now;
    const speed = snapshot.speedKmh ?? 0;
    const rpm = snapshot.rpm ?? 0;
    const throttle = snapshot.throttlePct ?? 0;
    const fuel = snapshot.engineFuelRateLh ?? 0;

    this.speedHistory.push({ t: now, v: speed });
    this.speedHistory = this.speedHistory.filter((s) => now - s.t <= 60_000);

    let accel = 0;
    if (this.speedHistory.length >= 2) {
      const a = this.speedHistory[this.speedHistory.length - 2]!;
      const b = this.speedHistory[this.speedHistory.length - 1]!;
      const dt = (b.t - a.t) / 1000;
      if (dt > 0) accel = (b.v - a.v) / 3.6 / dt;
    }

    const stopped = speed < 2;
    if (stopped && !this.wasStopped) this.stopCountWindow.push(now);
    this.wasStopped = stopped;
    this.stopCountWindow = this.stopCountWindow.filter((t) => now - t <= 300_000);
    const avgSpeed = this.speedHistory.length ? this.speedHistory.reduce((a, s) => a + s.v, 0) / this.speedHistory.length : speed;
    const isCityTraffic = this.stopCountWindow.length >= 8 && avgSpeed < 15;
    context.isCityTraffic = isCityTraffic;

    const cues: CareCue[] = [];
    const warn = (cue: CareCue) => {
      cues.push(cue);
      this.scoreWindow.push({ t: now, delta: -8 });
    };

    if (accel > 2.2) {
      if (this.accelStreakStart == null) this.accelStreakStart = now;
      if (now - this.accelStreakStart >= 1500) {
        warn({ id: "coach.easeOff", text: "Ease off the accelerator — smoother inputs save fuel.", severity: "coach" });
        this.accelStreakStart = now + 5000;
      }
    } else {
      this.accelStreakStart = undefined;
    }

    if (!isCityTraffic) {
      const vals = this.speedHistory.map((s) => s.v);
      const speedStable = this.speedHistory.length >= 4 && Math.max(...vals) - Math.min(...vals) < 3;
      if (rpm > 2800 && speedStable && speed > 20) {
        if (this.highRevCruiseStart == null) this.highRevCruiseStart = now;
        if (now - this.highRevCruiseStart >= 8000) {
          warn({ id: "coach.shiftUp", text: "Shift up — you're cruising at higher RPM than needed.", severity: "coach" });
          this.highRevCruiseStart = now + 20_000;
        }
      } else {
        this.highRevCruiseStart = undefined;
      }
    }

    if (throttle > 5) this.lastThrottleOpenAt = now;
    if (accel < -2.8 && this.lastThrottleOpenAt != null && now - this.lastThrottleOpenAt < 5000) {
      warn({ id: "coach.liftEarlier", text: "Try lifting off the throttle a bit earlier before braking.", severity: "coach" });
      this.lastThrottleOpenAt = undefined;
    }

    if (speed > 25 && throttle > 5 && accel < -0.5 && fuel > 0.5) {
      warn({ id: "coach.coast", text: "Coast instead of holding throttle while slowing down.", severity: "coach" });
    }

    if (speed > 25 && throttle < 2 && fuel < 0.1) {
      if (this.overrunStart == null) this.overrunStart = now;
      if (now - this.overrunStart >= 4000) {
        cues.push({ id: "coach.nice", text: "Nice coasting — that saves fuel.", severity: "celebration" });
        this.scoreWindow.push({ t: now, delta: 6 });
        this.overrunStart = now + 30_000;
      }
    } else {
      this.overrunStart = undefined;
    }

    if (!isCityTraffic && speed > 70) {
      if (speedOscillations(this.speedHistory, 8) >= 4) {
        warn({ id: "coach.steady", text: "Try to hold a steadier speed on the highway.", severity: "coach" });
      }
    }

    if (speed < 2 && rpm > 300) {
      if (this.idleSince == null) this.idleSince = now;
      if (now - this.idleSince > 180_000) {
        warn({ id: "coach.longIdle", text: "Consider turning off the engine during long idles.", severity: "coach" });
        this.idleSince = now + 300_000;
      }
    } else {
      this.idleSince = undefined;
    }

    if (!isCityTraffic && speed > 120) {
      if (this.highSpeedSince == null) this.highSpeedSince = now;
      if (now - this.highSpeedSince >= 20_000) {
        warn({ id: "coach.highSpeed", text: "High speed increases fuel consumption significantly.", severity: "coach" });
        this.highSpeedSince = now + 60_000;
      }
    } else {
      this.highSpeedSince = undefined;
    }

    this.updateLiveScore(now);
    context.liveEcoScore = this.liveScore;
    return cues;
  }

  private updateLiveScore(now: number) {
    this.scoreWindow = this.scoreWindow.filter((s) => now - s.t <= 30_000);
    const delta = this.scoreWindow.reduce((a, s) => a + s.delta, 0);
    this.liveScore = Math.min(100, Math.max(0, 100 + delta));
  }

  resetTrip(): void {
    this.speedHistory = [];
    this.liveScore = 100;
    this.scoreWindow = [];
  }
}

function speedOscillations(history: Array<{ t: number; v: number }>, amplitude: number): number {
  if (history.length < 6) return 0;
  let crossings = 0;
  const mean = history.reduce((a, s) => a + s.v, 0) / history.length;
  let above = history[0]!.v > mean;
  for (let i = 1; i < history.length; i++) {
    const v = history[i]!.v;
    const nowAbove = v > mean + amplitude / 2;
    const nowBelow = v < mean - amplitude / 2;
    if (above && nowBelow) {
      crossings++;
      above = false;
    }
    if (!above && nowAbove) {
      crossings++;
      above = true;
    }
  }
  return crossings;
}

export const ecoCoach = new EcoCoach();
