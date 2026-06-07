import type { NdviReading, DailyEto, DailyETc, DailyGdd } from '../types';
import type { CropConfig } from './cropConfig';

export type KcFormula = 'linear' | 'nonlinear';

const NDVI_MIN = 0.15; // bare soil baseline

export interface KcParams {
  kcMax: number;
  kcMin: number;
  ndviMax: number;
}

/**
 * Compute Kc from NDVI using the selected formula.
 *
 * Linear (Glenn et al.): Kc = 1.25 × NDVI + 0.20
 * Non-linear (Glenn et al. 2011): Kc = Kc_min + (Kc_max − Kc_min) × [(NDVI − NDVI_min) / (NDVI_max − NDVI_min)]
 *
 * Non-linear uses crop-specific kcMin, kcMax, and ndviMax from CropConfig.
 */
export function computeKc(ndvi: number, formula: KcFormula, params: KcParams): number {
  if (formula === 'linear') {
    const kc = 1.25 * ndvi + 0.20;
    return Math.max(0, Math.min(1.4, kc));
  }
  // Non-linear (Glenn et al. 2011)
  const ndviClamped = Math.max(NDVI_MIN, Math.min(params.ndviMax, ndvi));
  const ratio = (ndviClamped - NDVI_MIN) / (params.ndviMax - NDVI_MIN);
  const kc = params.kcMin + (params.kcMax - params.kcMin) * ratio;
  return Math.max(0, Math.min(params.kcMax, kc));
}

/**
 * Recalculate Kc for all NDVI readings using the specified formula.
 */
export function recalculateKc(
  ndviReadings: NdviReading[],
  formula: KcFormula,
  params: KcParams,
): NdviReading[] {
  return ndviReadings.map((r) => ({
    ...r,
    kc: Math.round(computeKc(r.ndviMean, formula, params) * 10000) / 10000,
  }));
}

/**
 * Interpolate Kc values linearly between satellite observations.
 * Returns a Map from date string to interpolated Kc value.
 */
export function interpolateKc(
  ndviReadings: NdviReading[],
  dateRange: string[],
): Map<string, number> {
  const kcMap = new Map<string, number>();
  if (ndviReadings.length === 0) return kcMap;

  const sorted = [...ndviReadings].sort((a, b) => a.date.localeCompare(b.date));

  for (const date of dateRange) {
    let before: NdviReading | null = null;
    let after: NdviReading | null = null;

    for (const r of sorted) {
      if (r.date <= date) before = r;
      if (r.date >= date && !after) after = r;
    }

    if (before && after && before.date !== after.date) {
      const t1 = new Date(before.date).getTime();
      const t2 = new Date(after.date).getTime();
      const t = new Date(date).getTime();
      const fraction = (t - t1) / (t2 - t1);
      const kc = before.kc + fraction * (after.kc - before.kc);
      kcMap.set(date, Math.round(kc * 10000) / 10000);
    } else if (before) {
      kcMap.set(date, before.kc);
    } else if (after) {
      kcMap.set(date, after.kc);
    }
  }

  return kcMap;
}

/**
 * Calculate daily ETc = ETo × Kc
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
      kcSource: 'ndvi',
    });
  }

  return results;
}

/**
 * Compute FAO-56 Kc from cumulative GDD using a trapezoidal curve.
 * Phases: initial → development ramp → mid-season plateau → late-season decline → end
 */
export function computeFaoKc(cumulativeGdd: number, config: CropConfig): number {
  const { kcMin, kcMax, kcEnd, gddKcDevStart, gddKcMidEnd, gddKcEnd } = config;

  if (cumulativeGdd <= gddKcDevStart) {
    return kcMin;
  }
  // Development phase: linear ramp from kcMin to kcMax
  const devEnd = (gddKcDevStart + gddKcMidEnd) / 2;
  if (cumulativeGdd < devEnd) {
    const fraction = (cumulativeGdd - gddKcDevStart) / (devEnd - gddKcDevStart);
    return kcMin + fraction * (kcMax - kcMin);
  }
  // Mid-season plateau
  if (cumulativeGdd <= gddKcMidEnd) {
    return kcMax;
  }
  // Late-season decline: linear ramp from kcMax to kcEnd
  if (cumulativeGdd < gddKcEnd) {
    const fraction = (cumulativeGdd - gddKcMidEnd) / (gddKcEnd - gddKcMidEnd);
    return kcMax + fraction * (kcEnd - kcMax);
  }
  return kcEnd;
}

/**
 * Calculate ETc with FAO Kc fallback: use FAO curve for days before first NDVI,
 * then switch to satellite-derived Kc from the first observation onward.
 */
export function calculateETcWithFallback(
  etoData: DailyEto[],
  ndviReadings: NdviReading[] | null,
  gddData: DailyGdd[],
  cropConfig: CropConfig,
): DailyETc[] {
  if (etoData.length === 0 || gddData.length === 0) return [];

  // Build GDD lookup by date
  const gddByDate = new Map<string, number>();
  for (const d of gddData) {
    gddByDate.set(d.date, d.cumulative);
  }

  // Determine first NDVI observation date (if any)
  const sortedNdvi = ndviReadings && ndviReadings.length > 0
    ? [...ndviReadings].sort((a, b) => a.date.localeCompare(b.date))
    : null;
  const firstNdviDate = sortedNdvi ? sortedNdvi[0].date : null;

  // Build NDVI Kc interpolation map for dates from first observation onward
  const dates = etoData.map((d) => d.date);
  const ndviKcMap = sortedNdvi ? interpolateKc(sortedNdvi, dates) : new Map<string, number>();

  const results: DailyETc[] = [];
  let cumulative = 0;

  for (const day of etoData) {
    const cumulativeGdd = gddByDate.get(day.date);
    if (cumulativeGdd === undefined) continue;

    let kc: number;
    let source: 'fao' | 'ndvi';

    // Use NDVI-derived Kc from first observation onward (if available)
    if (firstNdviDate && day.date >= firstNdviDate) {
      const ndviKc = ndviKcMap.get(day.date);
      if (ndviKc !== undefined) {
        kc = ndviKc;
        source = 'ndvi';
      } else {
        kc = computeFaoKc(cumulativeGdd, cropConfig);
        source = 'fao';
      }
    } else {
      kc = computeFaoKc(cumulativeGdd, cropConfig);
      source = 'fao';
    }

    const etc = day.eto * kc;
    cumulative += etc;

    results.push({
      date: day.date,
      etc: Math.round(etc * 100) / 100,
      cumulative: Math.round(cumulative * 100) / 100,
      kcSource: source,
    });
  }

  return results;
}
