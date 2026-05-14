import type { DailyGdd } from '../types';

export interface VernalizationDay {
  date: string;
  dailyVd: number;       // cold hours this day (0-24)
  cumulativeVd: number;  // running total from sowing
}

export interface VernalizationAlert {
  type: 'warning' | 'critical';
  message: string;
  vernPct: number; // percentage of target reached
}

// Vernalization temperature range: 32-45°F (0-7°C)
const VERN_MIN_F = 32;
const VERN_MAX_F = 45;

/**
 * Calculate daily and cumulative vernalization units from hourly temp data.
 * Each hour with temperature in 32-45°F (0-7°C) counts as 1 Vd.
 */
export function calculateCumulativeVernalization(gddData: DailyGdd[]): VernalizationDay[] {
  let cumVd = 0;
  return gddData.map((day) => {
    let dailyVd = 0;
    if (day.hourlyTemps && day.hourlyTemps.length > 0) {
      for (const tempF of day.hourlyTemps) {
        if (tempF >= VERN_MIN_F && tempF <= VERN_MAX_F) {
          dailyVd++;
        }
      }
    }
    cumVd += dailyVd;
    return { date: day.date, dailyVd, cumulativeVd: cumVd };
  });
}

/**
 * Check vernalization status and return alert if at risk.
 * @param cumulativeVd - total Vd hours accumulated so far
 * @param target - required Vd hours for this wheat variety
 * @param cumulativeGdd - current cumulative GDD
 * @param jointingGdd - GDD at which stem extension (jointing) begins
 */
export function getVernalizationStatus(
  cumulativeVd: number,
  target: number,
  cumulativeGdd: number,
  jointingGdd: number,
): VernalizationAlert | null {
  if (target <= 0) return null;

  const vernPct = Math.round((cumulativeVd / target) * 100);

  // Already met target — no alert
  if (cumulativeVd >= target) return null;

  // Past jointing without meeting vernalization
  if (cumulativeGdd >= jointingGdd) {
    return {
      type: 'critical',
      message: `Vernalization incomplete (${vernPct}%) at stem extension. Heading may be delayed or suppressed.`,
      vernPct,
    };
  }

  // Approaching jointing (within 80%) without meeting vernalization
  if (cumulativeGdd >= jointingGdd * 0.8 && vernPct < 80) {
    return {
      type: 'warning',
      message: `Vernalization at ${vernPct}% with stem extension approaching. ${target - cumulativeVd} Vd hours still needed.`,
      vernPct,
    };
  }

  return null;
}
