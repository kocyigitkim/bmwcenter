import { eq } from "drizzle-orm";
import { db } from "../storage/db";
import { streakState } from "../storage/schema";

export interface StreakState {
  id: number;
  currentDays: number;
  bestDays: number;
  shieldsAvailable: number;
  lastGoodDay: number | null;
  totalPoints: number;
}

function isSameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db_ = new Date(b);
  return da.getFullYear() === db_.getFullYear() && da.getMonth() === db_.getMonth() && da.getDate() === db_.getDate();
}

export function levelForPoints(points: number): number {
  let level = 1;
  while (100 * Math.pow(level, 1.35) <= points) {
    level += 1;
    if (level > 100) break;
  }
  return Math.max(1, level);
}

class StreakService {
  async state(): Promise<StreakState> {
    const rows = await db.select().from(streakState);
    if (rows[0]) return rows[0];
    const inserted = await db.insert(streakState).values({}).returning();
    return inserted[0]!;
  }

  /** Call at trip end with the day's score & whether a protective cue fired. */
  async recordDay(score: number, hadProtectionViolation: boolean, now = Date.now()): Promise<void> {
    const s = await this.state();
    if (s.lastGoodDay != null && isSameDay(s.lastGoodDay, now)) return;

    const good = score >= 80 && !hadProtectionViolation;
    let currentDays = s.currentDays;
    let shieldsAvailable = s.shieldsAvailable;
    let lastGoodDay = s.lastGoodDay;
    let bestDays = s.bestDays;

    if (good) {
      const yesterday = now - 86_400_000;
      if (s.lastGoodDay != null && isSameDay(s.lastGoodDay, yesterday)) currentDays += 1;
      else currentDays = 1;
      lastGoodDay = now;
      bestDays = Math.max(bestDays, currentDays);
      if (currentDays > 0 && currentDays % 10 === 0) shieldsAvailable += 1;
    } else if (shieldsAvailable > 0) {
      shieldsAvailable -= 1;
    } else {
      currentDays = 0;
    }

    await db.update(streakState).set({ currentDays, bestDays, shieldsAvailable, lastGoodDay }).where(eq(streakState.id, s.id));
  }

  async addPoints(points: number): Promise<void> {
    const s = await this.state();
    await db.update(streakState).set({ totalPoints: s.totalPoints + points }).where(eq(streakState.id, s.id));
  }
}

export const streakService = new StreakService();
