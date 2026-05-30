/**
 * Merge manual overrides into rain and irrigation data arrays.
 * Override values replace automatic values for matching dates.
 * Cumulative totals are recomputed after merging.
 */

import type { DailyRain, DailyIrrigation, FieldOverride } from '../types';

/**
 * Apply rain overrides: replace rain values for matching dates, recompute cumulative.
 */
export function applyRainOverrides(
  rainData: DailyRain[],
  overrides: FieldOverride[],
): DailyRain[] {
  const overrideMap = new Map<string, number>();
  for (const o of overrides) {
    if (o.rainMm !== null) overrideMap.set(o.date, o.rainMm);
  }

  if (overrideMap.size === 0) return rainData;

  // Collect all dates (original + override-only dates)
  const dateSet = new Set(rainData.map((r) => r.date));
  for (const date of overrideMap.keys()) dateSet.add(date);
  const allDates = Array.from(dateSet).sort();

  const originalMap = new Map(rainData.map((r) => [r.date, r]));

  let cumulative = 0;
  return allDates.map((date) => {
    const original = originalMap.get(date);
    const overrideRain = overrideMap.get(date);
    const rain = overrideRain !== undefined ? overrideRain : (original?.rain ?? 0);
    const source = overrideRain !== undefined ? 'manual' as const : original?.source;
    cumulative += rain;
    return { date, rain, cumulative, source };
  });
}

/**
 * Apply irrigation overrides: replace/add irrigation values for matching dates.
 */
export function applyIrrigationOverrides(
  irrigData: DailyIrrigation[] | null | undefined,
  overrides: FieldOverride[],
): DailyIrrigation[] {
  const overrideMap = new Map<string, number>();
  for (const o of overrides) {
    if (o.irrigationMm !== null) overrideMap.set(o.date, o.irrigationMm);
  }

  const original = irrigData ?? [];
  if (overrideMap.size === 0) return original;

  // Merge: override replaces matching dates, adds new dates
  const dateSet = new Set(original.map((i) => i.date));
  for (const date of overrideMap.keys()) dateSet.add(date);
  const allDates = Array.from(dateSet).sort();

  const originalMap = new Map(original.map((i) => [i.date, i]));

  return allDates
    .map((date) => {
      const overrideVal = overrideMap.get(date);
      const depthMm = overrideVal !== undefined ? overrideVal : (originalMap.get(date)?.depthMm ?? 0);
      return { date, depthMm };
    })
    .filter((d) => d.depthMm > 0);
}
