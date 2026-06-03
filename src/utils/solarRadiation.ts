import type { DailyGdd, DailyWeatherSummary, DailyASW } from '../types';
import type { CropConfig } from './cropConfig';

export interface RadiationDayMJ {
  date: string;
  mj: number;
  inWindow: boolean;
}

export interface RadiationWindowStatus {
  phase: 'before-buffer' | 'buffering' | 'in-window' | 'past-window';
  daysUntilWindow: number | null;
  forecastWindowStartDate: string | null;
  accumulatedMJ: number;
  windowMJ: number;
  dailyMJ: RadiationDayMJ[];
  referenceMJ: { poor: number; adequate: number; good: number };
  quality: 'poor' | 'adequate' | 'good' | 'unknown';
  windowGddProgress: number;
  periodLabel: string;
  waterStressDays: number;
  waterStressPct: number;
  gddRate: number;
}

type RadiationWindowConfig = NonNullable<CropConfig['radiationWindow']>;

const WM2_TO_MJ = 0.0864;

export function forecastGddRate(gddData: DailyGdd[], lookbackDays = 10): number {
  if (gddData.length < 2) return 0;
  const recent = gddData.slice(-lookbackDays);
  if (recent.length < 2) return 0;
  const totalGdd = recent.reduce((sum, d) => sum + d.gdd, 0);
  return totalGdd / recent.length;
}

export function forecastDaysToGdd(gddData: DailyGdd[], targetGdd: number, lookbackDays = 10): number | null {
  if (gddData.length === 0) return null;
  const currentGdd = gddData[gddData.length - 1].cumulative;
  const remaining = targetGdd - currentGdd;
  if (remaining <= 0) return 0;
  const rate = forecastGddRate(gddData, lookbackDays);
  if (rate <= 0) return null;
  return remaining / rate;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function calculateRadiationWindow(
  gddData: DailyGdd[],
  summaries: DailyWeatherSummary[],
  config: RadiationWindowConfig,
  aswData?: DailyASW[] | null,
): RadiationWindowStatus {
  const { gddStart, gddEnd, preBufferDays, referenceMJ, periodLabel } = config;

  const result: RadiationWindowStatus = {
    phase: 'before-buffer',
    daysUntilWindow: null,
    forecastWindowStartDate: null,
    accumulatedMJ: 0,
    windowMJ: 0,
    dailyMJ: [],
    referenceMJ,
    quality: 'unknown',
    windowGddProgress: 0,
    periodLabel,
    waterStressDays: 0,
    waterStressPct: 0,
    gddRate: 0,
  };

  if (gddData.length === 0) return result;

  const currentGdd = gddData[gddData.length - 1].cumulative;
  const todayDate = gddData[gddData.length - 1].date;
  const rate = forecastGddRate(gddData);
  result.gddRate = Math.round(rate * 10) / 10;

  // Build lookup maps
  const gddByDate = new Map<string, number>();
  for (const d of gddData) gddByDate.set(d.date, d.cumulative);

  const solarByDate = new Map<string, number>();
  for (const s of summaries) solarByDate.set(s.date, s.solarRadiationMeanWm2);

  const aswByDate = new Map<string, DailyASW>();
  if (aswData) for (const a of aswData) aswByDate.set(a.date, a);

  // Determine phase
  if (currentGdd >= gddEnd) {
    result.phase = 'past-window';
    result.windowGddProgress = 100;
  } else if (currentGdd >= gddStart) {
    result.phase = 'in-window';
    result.windowGddProgress = Math.round(((currentGdd - gddStart) / (gddEnd - gddStart)) * 100);
  } else {
    const daysToWindow = forecastDaysToGdd(gddData, gddStart);
    result.daysUntilWindow = daysToWindow !== null ? Math.round(daysToWindow) : null;
    if (daysToWindow !== null) {
      result.forecastWindowStartDate = addDays(todayDate, Math.round(daysToWindow));
    }
    if (daysToWindow !== null && daysToWindow <= preBufferDays) {
      result.phase = 'buffering';
    } else {
      result.phase = 'before-buffer';
    }
  }

  // Accumulate MJ/m² for days where GDD is within range or in buffer zone
  // Buffer: accumulate from (preBufferDays before forecasted window start) or from actual window
  // For simplicity, accumulate all days where cumGdd >= gddStart - bufferGdd OR phase is buffering
  // The buffer in GDD terms: preBufferDays * gddRate
  const bufferGdd = rate > 0 ? preBufferDays * rate : 0;
  const accumStartGdd = Math.max(0, gddStart - bufferGdd);

  let windowDaysTotal = 0;
  let waterStressDays = 0;

  for (const day of gddData) {
    const cumGdd = day.cumulative;
    if (cumGdd < accumStartGdd) continue;
    if (cumGdd > gddEnd) break;

    const solar = solarByDate.get(day.date);
    if (solar === undefined) continue;

    const dailyMj = Math.round(solar * WM2_TO_MJ * 100) / 100;
    const inWindow = cumGdd >= gddStart && cumGdd <= gddEnd;

    result.dailyMJ.push({ date: day.date, mj: dailyMj, inWindow });
    result.accumulatedMJ += dailyMj;

    if (inWindow) {
      result.windowMJ += dailyMj;
      windowDaysTotal++;

      // Check water stress
      const asw = aswByDate.get(day.date);
      if (asw && asw.asw < asw.madThreshold) {
        waterStressDays++;
      }
    }
  }

  result.accumulatedMJ = Math.round(result.accumulatedMJ * 10) / 10;
  result.windowMJ = Math.round(result.windowMJ * 10) / 10;
  result.waterStressDays = waterStressDays;
  result.waterStressPct = windowDaysTotal > 0 ? Math.round((waterStressDays / windowDaysTotal) * 100) : 0;

  // Quality assessment
  if (result.phase === 'past-window' || (result.phase === 'in-window' && result.windowGddProgress > 75)) {
    if (result.windowMJ >= referenceMJ.good) result.quality = 'good';
    else if (result.windowMJ >= referenceMJ.adequate) result.quality = 'adequate';
    else if (result.windowMJ > 0) result.quality = 'poor';
  }

  return result;
}

export function getRadiationAlert(
  status: RadiationWindowStatus,
): { type: 'info' | 'warning'; message: string; key: string } | null {
  if (status.phase === 'buffering' && status.daysUntilWindow !== null && status.daysUntilWindow <= 14) {
    return {
      type: 'info',
      key: 'radiation.alertApproaching',
      message: `Critical radiation period (${status.periodLabel}) approaching in ~${status.daysUntilWindow} days`,
    };
  }
  if (status.phase === 'in-window' && status.waterStressDays > 0) {
    return {
      type: 'warning',
      key: 'radiation.alertWaterStress',
      message: `Water stress detected during critical radiation window: ${status.waterStressDays} days below MAD threshold`,
    };
  }
  if (status.phase === 'in-window' && status.quality === 'poor') {
    return {
      type: 'warning',
      key: 'radiation.alertPoorRadiation',
      message: `Low radiation accumulation during critical period: ${status.windowMJ} MJ/m² (adequate: ${status.referenceMJ.adequate})`,
    };
  }
  return null;
}
