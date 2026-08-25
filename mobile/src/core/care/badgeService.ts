import { db } from "../storage/db";
import { badgeAwards } from "../storage/schema";

export function badgeTitleKey(badgeKey: string): string {
  const known = ["coldBlooded", "turboWhisperer", "featherFoot", "thermostatSentinel", "century", "frugal", "longHauler"];
  return known.includes(badgeKey) ? `badge.${badgeKey}` : `badge.${badgeKey}`;
}

class BadgeService {
  async awardedKeys(): Promise<Set<string>> {
    const rows = await db.select().from(badgeAwards);
    return new Set(rows.map((r) => r.badgeKey));
  }

  /** Awards only while the vehicle is stopped. Returns newly-earned badge keys. */
  async evaluateAwards(params: {
    isStopped: boolean;
    cleanWarmups: number;
    compliantCooldowns: number;
    harshAccelKm: number;
    tripCount: number;
    longHaulKm: number;
    thermostatCaught: boolean;
  }): Promise<string[]> {
    if (!params.isStopped) return [];
    const awarded = await this.awardedKeys();
    const newly: string[] = [];
    const award = async (key: string, progress: number) => {
      if (awarded.has(key)) return;
      await db.insert(badgeAwards).values({ badgeKey: key, awardedAt: Date.now(), progressSnapshot: progress });
      newly.push(key);
    };
    if (params.cleanWarmups >= 25) await award("coldBlooded", params.cleanWarmups);
    if (params.compliantCooldowns >= 50) await award("turboWhisperer", params.compliantCooldowns);
    if (params.harshAccelKm >= 1000) await award("featherFoot", params.harshAccelKm);
    if (params.thermostatCaught) await award("thermostatSentinel", 1);
    if (params.tripCount >= 100) await award("century", params.tripCount);
    if (params.longHaulKm >= 300) await award("longHauler", params.longHaulKm);
    return newly;
  }
}

export const badgeService = new BadgeService();
