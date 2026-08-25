import { AudioAnnouncer } from "../alerts/audioAnnouncer";
import { severityRank, type CareCue } from "./careTypes";
import { planFor } from "./severityRouter";
import type { CareChannelPlan } from "./careTypes";

interface Config {
  coachMinIntervalMs: number;
  sameCueMinIntervalMs: number;
  coachHourlyCap: number;
  ignoreMuteHoursMs: number;
  ignoreThreshold: number;
  maxWords: number;
  frequencyMultiplier: number;
}

const DEFAULT_CONFIG: Config = {
  coachMinIntervalMs: 25_000,
  sameCueMinIntervalMs: 120_000,
  coachHourlyCap: 12,
  ignoreMuteHoursMs: 24 * 3600_000,
  ignoreThreshold: 3,
  maxWords: 14,
  frequencyMultiplier: 1.0,
};

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Single-queue spoken-cue scheduler with priority ordering and fatigue rules
 * (avoids repeating/spamming the driver with cues). */
class CueScheduler {
  private config: Config = { ...DEFAULT_CONFIG };
  private queue: CareCue[] = [];
  private lastAnyCoachAt = 0;
  private lastCueAt: Record<string, number> = {};
  private coachTimestamps: number[] = [];
  private ignoreCounts: Record<string, number> = {};
  private mutedUntil: Record<string, number> = {};
  private isSpeaking = false;
  private drainTimer: ReturnType<typeof setTimeout> | undefined;
  private coachWarningCount = 0;
  private positiveCount = 0;

  onPresented: ((cue: CareCue, plan: CareChannelPlan) => void) | undefined;

  updateFrequency(multiplier: number): void {
    this.config.frequencyMultiplier = Math.min(2.0, Math.max(0.5, multiplier));
  }

  enqueue(cue: CareCue, now = Date.now(), appInBackground = false): void {
    if (wordCount(cue.text) > this.config.maxWords) return;
    const until = this.mutedUntil[cue.id];
    if (until != null && until > now) return;

    if (cue.severity === "coach") {
      const minCoach = this.config.coachMinIntervalMs * this.config.frequencyMultiplier;
      if (now - this.lastAnyCoachAt < minCoach) return;
      this.coachTimestamps = this.coachTimestamps.filter((t) => now - t < 3_600_000);
      if (this.coachTimestamps.length >= this.config.coachHourlyCap) return;
      if (this.coachWarningCount >= 5 * Math.max(1, this.positiveCount + 1)) return;
    }

    if (cue.severity !== "critical") {
      const last = this.lastCueAt[cue.id];
      if (last != null && now - last < this.config.sameCueMinIntervalMs) return;
    }

    const idx = this.queue.findIndex((c) => c.id === cue.id);
    if (idx >= 0) {
      if (severityRank(cue.severity) > severityRank(this.queue[idx]!.severity)) this.queue[idx] = cue;
      return;
    }
    this.queue.push(cue);
    this.queue.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
    this.drain(now, appInBackground);
  }

  enqueueAll(cues: CareCue[], now = Date.now(), appInBackground = false): void {
    cues.forEach((c) => this.enqueue(c, now, appInBackground));
  }

  markIgnored(cueId: string, now = Date.now()): void {
    const n = (this.ignoreCounts[cueId] ?? 0) + 1;
    this.ignoreCounts[cueId] = n;
    if (n >= this.config.ignoreThreshold) {
      this.mutedUntil[cueId] = now + this.config.ignoreMuteHoursMs;
      this.ignoreCounts[cueId] = 0;
    }
  }

  resetFatigue(): void {
    this.ignoreCounts = {};
    this.mutedUntil = {};
    this.coachWarningCount = 0;
    this.positiveCount = 0;
  }

  wouldAccept(cue: CareCue, now = Date.now()): boolean {
    const until = this.mutedUntil[cue.id];
    if (until != null && until > now) return false;
    if (cue.severity === "coach") {
      const minCoach = this.config.coachMinIntervalMs * this.config.frequencyMultiplier;
      if (now - this.lastAnyCoachAt < minCoach) return false;
      const recent = this.coachTimestamps.filter((t) => now - t < 3_600_000);
      if (recent.length >= this.config.coachHourlyCap) return false;
    }
    if (cue.severity !== "critical") {
      const last = this.lastCueAt[cue.id];
      if (last != null && now - last < this.config.sameCueMinIntervalMs) return false;
    }
    return wordCount(cue.text) <= this.config.maxWords;
  }

  private drain(now: number, appInBackground: boolean): void {
    if (this.isSpeaking || this.queue.length === 0) return;
    const cue = this.queue.shift()!;
    this.isSpeaking = true;
    this.lastCueAt[cue.id] = now;
    if (cue.severity === "coach") {
      this.lastAnyCoachAt = now;
      this.coachTimestamps.push(now);
      this.coachWarningCount += 1;
    }
    if (cue.severity === "celebration") {
      this.positiveCount += 1;
      this.coachWarningCount = 0;
    }
    const plan = planFor(cue.severity, appInBackground);
    this.onPresented?.(cue, plan);
    if (plan.speak) AudioAnnouncer.announceCare(cue.text, cue.severity, cue.id);

    if (this.drainTimer) clearTimeout(this.drainTimer);
    this.drainTimer = setTimeout(() => {
      this.isSpeaking = false;
      this.drain(Date.now(), appInBackground);
    }, 2500);
  }
}

export const cueScheduler = new CueScheduler();
