import type { WeatherReading, WeatherSource, HourlyTemp, DailyGdd } from '../types';
import { getStationLocalDate, getStationLocalHour } from './stationTime';

const DEFAULT_BASE_TEMP = 50; // °F
const DEFAULT_UPPER_CAP = 86; // °F

/**
 * Calculate GDD contribution for a single hour.
 * Applies the base floor and optional upper cap before subtracting base temp.
 */
export function hourlyGddContribution(
  tempF: number,
  baseTemp: number = DEFAULT_BASE_TEMP,
  upperCap: number | null = DEFAULT_UPPER_CAP,
): number {
  let capped = Math.max(tempF, baseTemp);
  if (upperCap !== null) capped = Math.min(capped, upperCap);
  return capped - baseTemp;
}

/**
 * Determine the dominant source for a set of readings.
 * If any reading is non-station, the day is considered estimated.
 */
function dominantSource(sources: (WeatherSource | undefined)[]): WeatherSource {
  const counts: Record<string, number> = {};
  for (const s of sources) {
    const key = s || 'station';
    counts[key] = (counts[key] || 0) + 1;
  }
  if (counts['fallback'] > 0) return 'fallback';
  if (counts['carry_forward'] > 0) return 'carry_forward';
  return 'station';
}

/**
 * Group raw 5-minute weather readings into hourly averages per day.
 * Also tracks source per date for downstream use.
 */
export function groupReadingsToHourly(readings: WeatherReading[]): { hourlyTemps: HourlyTemp[]; sourceByDate: Map<string, WeatherSource> } {
  const groups = new Map<string, number[]>();
  const sourcesByDate = new Map<string, (WeatherSource | undefined)[]>();

  for (const r of readings) {
    if (r.tempf == null || isNaN(r.tempf)) continue;
    const dateStr = getStationLocalDate(r.dateutc);
    const hour = getStationLocalHour(r.dateutc);
    const key = `${dateStr}_${hour}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(r.tempf);

    if (!sourcesByDate.has(dateStr)) sourcesByDate.set(dateStr, []);
    sourcesByDate.get(dateStr)!.push(r.source);
  }

  const hourlyTemps: HourlyTemp[] = [];
  for (const [key, temps] of groups) {
    const [date, hourStr] = key.split('_');
    const avgTemp = temps.reduce((sum, t) => sum + t, 0) / temps.length;
    hourlyTemps.push({
      date,
      hour: parseInt(hourStr, 10),
      avgTempF: avgTemp,
    });
  }

  hourlyTemps.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    return dateCmp !== 0 ? dateCmp : a.hour - b.hour;
  });

  const sourceByDate = new Map<string, WeatherSource>();
  for (const [date, sources] of sourcesByDate) {
    sourceByDate.set(date, dominantSource(sources));
  }

  return { hourlyTemps, sourceByDate };
}

/**
 * Calculate daily GDD from hourly temperature data using the degree-hour method.
 *
 * For each hour: cappedTemp = clamp(tempF, 50, 86), degreeHour = cappedTemp - 50
 * dailyGDD = sum(degreeHours) / 24
 */
export function calculateDailyGdd(
  hourlyTemps: HourlyTemp[],
  sowingDate: string,
  baseTemp: number = DEFAULT_BASE_TEMP,
  upperCap: number | null = DEFAULT_UPPER_CAP,
  sourceByDate?: Map<string, WeatherSource>,
): DailyGdd[] {
  // Group hourly temps by date
  const byDate = new Map<string, HourlyTemp[]>();
  for (const ht of hourlyTemps) {
    if (ht.date <= sowingDate) continue; // Skip sowing day — accumulate from day after
    if (!byDate.has(ht.date)) {
      byDate.set(ht.date, []);
    }
    byDate.get(ht.date)!.push(ht);
  }

  // Sort dates
  const dates = Array.from(byDate.keys()).sort();

  const results: DailyGdd[] = [];
  let cumulative = 0;

  for (const date of dates) {
    const hours = byDate.get(date)!;

    // Build array of 24 hourly temps (fill missing hours with interpolation or 0 contribution)
    const hourlyTempArray = new Array(24).fill(null as number | null);
    for (const h of hours) {
      hourlyTempArray[h.hour] = h.avgTempF;
    }

    // Interpolate missing hours if we have some data
    const filledTemps = interpolateMissingHours(hourlyTempArray);

    // Calculate degree-hours
    let totalDegreeHours = 0;
    for (const temp of filledTemps) {
      if (temp !== null) {
        totalDegreeHours += hourlyGddContribution(temp, baseTemp, upperCap);
      }
    }

    // Count hours with data for accurate averaging
    const hoursWithData = filledTemps.filter((t) => t !== null).length;
    const dailyGdd = hoursWithData > 0 ? totalDegreeHours / 24 : 0;

    cumulative += dailyGdd;

    results.push({
      date,
      gdd: Math.round(dailyGdd * 100) / 100,
      cumulative: Math.round(cumulative * 100) / 100,
      hourlyTemps: filledTemps.map((t) => (t !== null ? Math.round(t * 10) / 10 : 0)),
      source: sourceByDate?.get(date),
    });
  }

  return results;
}

/**
 * Simple linear interpolation for missing hours.
 * Only interpolates between known values, does not extrapolate.
 */
function interpolateMissingHours(temps: (number | null)[]): (number | null)[] {
  const result = [...temps];

  for (let i = 0; i < 24; i++) {
    if (result[i] !== null) continue;

    // Find nearest non-null before and after
    let prevIdx = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (result[j] !== null) {
        prevIdx = j;
        break;
      }
    }

    let nextIdx = -1;
    for (let j = i + 1; j < 24; j++) {
      if (result[j] !== null) {
        nextIdx = j;
        break;
      }
    }

    if (prevIdx >= 0 && nextIdx >= 0) {
      // Linear interpolation
      const prevVal = result[prevIdx]!;
      const nextVal = result[nextIdx]!;
      const fraction = (i - prevIdx) / (nextIdx - prevIdx);
      result[i] = prevVal + fraction * (nextVal - prevVal);
    } else if (prevIdx >= 0) {
      result[i] = result[prevIdx];
    } else if (nextIdx >= 0) {
      result[i] = result[nextIdx];
    }
    // Otherwise leave as null (no data at all for this day)
  }

  return result;
}

/**
 * Process raw weather readings into daily GDD data.
 * This is the main entry point for GDD calculation.
 */
export function processWeatherData(
  readings: WeatherReading[],
  sowingDate: string,
  baseTemp: number = DEFAULT_BASE_TEMP,
  upperCap: number | null = DEFAULT_UPPER_CAP,
): DailyGdd[] {
  const { hourlyTemps, sourceByDate } = groupReadingsToHourly(readings);
  return calculateDailyGdd(hourlyTemps, sowingDate, baseTemp, upperCap, sourceByDate);
}
