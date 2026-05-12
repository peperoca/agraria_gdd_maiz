import type { NdviReading, DailyEto, DailyETc } from '../types';

/**
 * Interpolate NDVI/Kc values linearly between satellite observations.
 * Returns a Map from date string to interpolated Kc value.
 */
export function interpolateKc(
  ndviReadings: NdviReading[],
  dateRange: string[], // All dates we need Kc for
): Map<string, number> {
  const kcMap = new Map<string, number>();
  if (ndviReadings.length === 0) return kcMap;

  // Sort NDVI readings by date
  const sorted = [...ndviReadings].sort((a, b) => a.date.localeCompare(b.date));

  // For each date in range, find surrounding NDVI observations and interpolate
  for (const date of dateRange) {
    // Find bracketing observations
    let before: NdviReading | null = null;
    let after: NdviReading | null = null;

    for (const r of sorted) {
      if (r.date <= date) before = r;
      if (r.date >= date && !after) after = r;
    }

    if (before && after && before.date !== after.date) {
      // Linear interpolation
      const t1 = new Date(before.date).getTime();
      const t2 = new Date(after.date).getTime();
      const t = new Date(date).getTime();
      const fraction = (t - t1) / (t2 - t1);
      const kc = before.kc + fraction * (after.kc - before.kc);
      kcMap.set(date, Math.round(kc * 10000) / 10000);
    } else if (before) {
      // Use last known Kc (extrapolate forward)
      kcMap.set(date, before.kc);
    } else if (after) {
      // Use first known Kc (extrapolate backward)
      kcMap.set(date, after.kc);
    }
  }

  return kcMap;
}

/**
 * Calculate daily ETc = ETo × Kc
 * Returns array of daily ETc with cumulative values.
 */
export function calculateETc(
  etoData: DailyEto[],
  ndviReadings: NdviReading[],
): DailyETc[] {
  if (ndviReadings.length === 0 || etoData.length === 0) return [];

  const dates = etoData.map((d) => d.date);
  const kcMap = interpolateKc(ndviReadings, dates);

  const results: DailyETc[] = [];
  let cumulative = 0;

  for (const day of etoData) {
    const kc = kcMap.get(day.date);
    if (kc === undefined) continue;

    const etc = day.eto * kc;
    cumulative += etc;

    results.push({
      date: day.date,
      etc: Math.round(etc * 100) / 100,
      cumulative: Math.round(cumulative * 100) / 100,
    });
  }

  return results;
}
