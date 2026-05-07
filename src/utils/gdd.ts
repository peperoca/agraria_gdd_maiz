import type { WeatherReading, HourlyTemp, DailyGdd } from '../types';

const BASE_TEMP = 50; // °F
const UPPER_CAP = 86; // °F

/**
 * Calculate GDD contribution for a single hour.
 * Applies the 50°F floor and 86°F cap before subtracting base temp.
 */
export function hourlyGddContribution(tempF: number): number {
  const capped = Math.min(Math.max(tempF, BASE_TEMP), UPPER_CAP);
  return capped - BASE_TEMP;
}

/**
 * Group raw 5-minute weather readings into hourly averages per day.
 */
export function groupReadingsToHourly(readings: WeatherReading[]): HourlyTemp[] {
  // Group by date + hour
  const groups = new Map<string, number[]>();

  for (const r of readings) {
    if (r.tempf == null || isNaN(r.tempf)) continue;
    const dt = new Date(r.dateutc);
    const dateStr = dt.toISOString().split('T')[0];
    const hour = dt.getHours();
    const key = `${dateStr}_${hour}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(r.tempf);
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

  // Sort by date then hour
  hourlyTemps.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    return dateCmp !== 0 ? dateCmp : a.hour - b.hour;
  });

  return hourlyTemps;
}

/**
 * Calculate daily GDD from hourly temperature data using the degree-hour method.
 *
 * For each hour: cappedTemp = clamp(tempF, 50, 86), degreeHour = cappedTemp - 50
 * dailyGDD = sum(degreeHours) / 24
 */
export function calculateDailyGdd(
  hourlyTemps: HourlyTemp[],
  sowingDate: string
): DailyGdd[] {
  // Group hourly temps by date
  const byDate = new Map<string, HourlyTemp[]>();
  for (const ht of hourlyTemps) {
    if (ht.date < sowingDate) continue; // Skip data before sowing
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
        totalDegreeHours += hourlyGddContribution(temp);
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
  sowingDate: string
): DailyGdd[] {
  const hourlyTemps = groupReadingsToHourly(readings);
  return calculateDailyGdd(hourlyTemps, sowingDate);
}
