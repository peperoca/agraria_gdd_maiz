/**
 * Soil Water Balance Model
 *
 * Computes daily Available Soil Water (ASW) bounded between 0 and TAW.
 * When inputs exceed TAW, excess is tracked as drainage/runoff.
 *
 * ASW(t) = clamp(ASW(t-1) + Rain + Irrigation - ETc, 0, TAW)
 * Excess(t) = max(0, ASW(t-1) + Rain + Irrigation - ETc - TAW)
 */

import type { DailyASW, DailyRain, DailyETc, DailyIrrigation } from '../types';

export interface WaterBalanceParams {
  tawMm: number;           // Total Available Water (mm) — upper bound
  madFraction: number;     // Management Allowable Depletion (0-1)
  initialAswMm?: number;   // Starting ASW (mm), defaults to TAW
}

/**
 * Compute the daily soil water balance from sowing to present.
 *
 * @param etcData   Daily ETc array (date + etc mm/day)
 * @param rainData  Daily rain array (date + rain mm/day)
 * @param irrigData Daily irrigation array (date + depthMm), may be null
 * @param params    Soil parameters (TAW, MAD, initial ASW)
 * @returns         DailyASW[] with bounded ASW, excess, and cumulative excess
 */
export function computeWaterBalance(
  etcData: DailyETc[],
  rainData: DailyRain[],
  irrigData: DailyIrrigation[] | null | undefined,
  params: WaterBalanceParams,
): DailyASW[] {
  const { tawMm, madFraction, initialAswMm } = params;

  if (tawMm <= 0) return [];

  const madThreshold = (1 - madFraction) * tawMm;

  // Build lookup maps by date
  const rainMap = new Map<string, number>();
  for (const r of rainData) rainMap.set(r.date, r.rain);

  const etcMap = new Map<string, number>();
  for (const e of etcData) etcMap.set(e.date, e.etc);

  const irrigMap = new Map<string, number>();
  if (irrigData) {
    for (const i of irrigData) irrigMap.set(i.date, i.depthMm);
  }

  // Collect all unique dates and sort
  const allDates = new Set<string>();
  rainData.forEach((r) => allDates.add(r.date));
  etcData.forEach((e) => allDates.add(e.date));
  if (irrigData) irrigData.forEach((i) => allDates.add(i.date));
  const dates = Array.from(allDates).sort();

  if (dates.length === 0) return [];

  let asw = initialAswMm ?? tawMm;
  let cumulativeExcess = 0;
  const result: DailyASW[] = [];

  for (const date of dates) {
    const rain = rainMap.get(date) ?? 0;
    const etc = etcMap.get(date) ?? 0;
    const irrigation = irrigMap.get(date) ?? 0;

    const aswRaw = asw + rain + irrigation - etc;
    const excess = Math.max(0, aswRaw - tawMm);
    asw = Math.max(0, Math.min(tawMm, aswRaw));
    cumulativeExcess += excess;

    result.push({
      date,
      asw: Math.round(asw * 100) / 100,
      rain: Math.round(rain * 100) / 100,
      irrigation: Math.round(irrigation * 100) / 100,
      etc: Math.round(etc * 100) / 100,
      excess: Math.round(excess * 100) / 100,
      cumulativeExcess: Math.round(cumulativeExcess * 100) / 100,
      taw: tawMm,
      madThreshold: Math.round(madThreshold * 100) / 100,
    });
  }

  return result;
}
