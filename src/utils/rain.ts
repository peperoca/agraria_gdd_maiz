/**
 * Rain data processing
 *
 * The Ambient Weather WS-2902C reports `dailyrainin` which is a running
 * accumulation that resets at midnight **local time**. To get the daily
 * total, we take the max `dailyrainin` value for each local day.
 *
 * IMPORTANT: We must group by station local date, not UTC date.
 * The station is in Uruguay (UTC-3, no DST). Without this offset,
 * late-evening readings (9pm–midnight local = 0–3am UTC next day)
 * carry the current day's accumulation into the next UTC day.
 *
 * Values are in inches; we convert to mm (* 25.4) for display.
 */

import type { WeatherReading, DailyRain } from '../types';
import { getStationLocalDate } from './stationTime';

const INCHES_TO_MM = 25.4;

/**
 * Process raw weather readings into daily rainfall totals with cumulative.
 */
export function processRainData(readings: WeatherReading[], sowingDate: string): DailyRain[] {
  if (readings.length === 0) return [];

  // Group readings by station local date (YYYY-MM-DD)
  const dailyMap = new Map<string, number>();

  for (const r of readings) {
    if (r.dailyrainin === undefined || r.dailyrainin === null) continue;

    const date = getStationLocalDate(r.dateutc);
    const current = dailyMap.get(date) ?? 0;
    // dailyrainin is cumulative within the day, so max = daily total
    dailyMap.set(date, Math.max(current, r.dailyrainin));
  }

  // Sort by date and filter from sowing date
  const dates = Array.from(dailyMap.keys())
    .filter((d) => d >= sowingDate)
    .sort();

  let cumulative = 0;
  const result: DailyRain[] = [];

  for (const date of dates) {
    const rainInches = dailyMap.get(date) ?? 0;
    const rainMm = Math.round(rainInches * INCHES_TO_MM * 100) / 100;
    cumulative += rainMm;

    result.push({
      date,
      rain: rainMm,
      cumulative: Math.round(cumulative * 100) / 100,
    });
  }

  return result;
}
