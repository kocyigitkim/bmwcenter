import { and, eq } from "drizzle-orm";
import { db } from "../storage/db";
import { challengeProgress } from "../storage/schema";
import { coldEngineShield } from "./coldEngineShield";
import type { VehicleSnapshot } from "../obd/vehicleSnapshot";
import type { Trip } from "../storage/models";
import type { CareCue, CareContext } from "./careTypes";
import type { CareFeature } from "./careFeature";

interface Definition {
  key: string;
  difficulty: "easy" | "medium" | "hard";
  points: number;
  defaultTarget: number;
}

const POOL: Definition[] = [
  { key: "cleanWarmup", difficulty: "easy", points: 30, defaultTarget: 5 },
  { key: "steadyCruise", difficulty: "easy", points: 30, defaultTarget: 5 },
  { key: "idleDiet", difficulty: "medium", points: 50, defaultTarget: 0.7 },
  { key: "softFoot", difficulty: "medium", points: 50, defaultTarget: 3 },
  { key: "efficiencyJump", difficulty: "medium", points: 50, defaultTarget: 0.95 },
  { key: "zeroHarshBrake", difficulty: "hard", points: 80, defaultTarget: 0 },
  { key: "nineties", difficulty: "hard", points: 80, defaultTarget: 5 },
];

/** Monday-start ISO week bucket. */
export function weekStart(date: number): number {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + diff);
  return d.getTime();
}

class ChallengeEngine implements CareFeature {
  id = "challenges";

  isEnabled(settings: { careWeeklyChallenges: boolean }): boolean {
    return settings.careWeeklyChallenges;
  }

  evaluate(_snapshot: VehicleSnapshot, context: CareContext): CareCue[] {
    this.ensureWeekChallenges(context.now).catch(() => undefined);
    return [];
  }

  async currentWeek(week: number) {
    const all = await db.select().from(challengeProgress);
    return all.filter((r) => r.weekStart === week);
  }

  async ensureWeekChallenges(now: number): Promise<void> {
    const week = weekStart(now);
    const existing = await this.currentWeek(week);
    if (existing.length > 0) return;

    const all = await db.select().from(challengeProgress);
    const cutoff = now - 21 * 86_400_000;
    const recentKeys = new Set(all.filter((r) => r.weekStart >= cutoff).map((r) => r.challengeKey));

    const pick = (difficulty: Definition["difficulty"]) => {
      const candidates = POOL.filter((d) => d.difficulty === difficulty && !recentKeys.has(d.key));
      const pool = candidates.length ? candidates : POOL.filter((d) => d.difficulty === difficulty);
      return pool[Math.floor(Math.random() * pool.length)]!;
    };

    for (const def of [pick("easy"), pick("medium"), pick("hard")]) {
      await db.insert(challengeProgress).values({
        id: `chal_${week}_${def.key}`,
        challengeKey: def.key,
        weekStart: week,
        target: def.defaultTarget,
        difficulty: def.difficulty,
        points: def.points,
      });
    }
  }

  async onTripEnded(trip: Trip, context: CareContext): Promise<CareCue[]> {
    await this.ensureWeekChallenges(context.now);
    const week = weekStart(context.now);
    const rows = await this.currentWeek(week);

    for (const row of rows) {
      if (row.completedAt != null) continue;
      let current = row.current;
      switch (row.challengeKey) {
        case "cleanWarmup":
          if (coldEngineShield.coldViolationsThisTrip === 0) current += 1;
          break;
        case "zeroHarshBrake": {
          const harsh = (trip.events ?? []).filter((e) => e.type === "harshBrake").length;
          current = harsh === 0 && trip.distanceKm > 0 ? Math.min(row.target, current + trip.distanceKm) : -1;
          break;
        }
        case "nineties":
          current = (trip.scoreTotal ?? 0) >= 90 ? current + 1 : 0;
          break;
        case "softFoot": {
          const harsh = (trip.events ?? []).filter((e) => e.type === "harshAccel").length;
          if (harsh === 0) current = Math.min(row.target, current + trip.distanceKm);
          break;
        }
        default:
          break;
      }
      const completedAt = current >= row.target && current >= 0 ? context.now : null;
      await db.update(challengeProgress).set({ current, completedAt }).where(eq(challengeProgress.id, row.id));
    }
    return [];
  }
}

export const challengeEngine = new ChallengeEngine();
