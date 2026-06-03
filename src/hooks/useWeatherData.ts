import { useState, useCallback } from 'react';
import type { DailyGdd, DailyEto, DailyRain, DailyWeatherSummary, WeatherReading, WeatherSource } from '../types';
import { processWeatherData } from '../utils/gdd';
import { processEtoData, aggregateDailySummaries } from '../utils/eto';
import { processRainData } from '../utils/rain';
import { getWeatherData, type WeatherReadingRaw } from '../utils/api';
import { getCachedWeatherData, setCachedWeatherData, getSettings } from '../utils/storage';

interface WeatherResult {
  gdd: DailyGdd[];
  eto: DailyEto[];
  rain: DailyRain[];
  dailySummaries: DailyWeatherSummary[];
}

export type GapFillPreference = 'carry_forward' | 'fallback';

interface UseWeatherDataResult {
  loading: boolean;
  error: string | null;
  data: WeatherResult | null;
  fetchData: (sowingDate: string, stationMac?: string, baseTempF?: number, upperCapF?: number | null, gapPref?: GapFillPreference) => Promise<WeatherResult>;
}

/**
 * Convert raw backend weather readings to the WeatherReading format
 * expected by the GDD and ETo calculation utils.
 * Filters out readings with no temperature (required for GDD/ETo).
 */
function toWeatherReadings(raw: WeatherReadingRaw[]): WeatherReading[] {
  return raw
    .filter((r) => r.tempf !== null)
    .map((r) => ({
      dateutc: r.dateutc,
      tempf: r.tempf!,
      humidity: r.humidity ?? undefined,
      windspeedmph: r.windspeedmph ?? undefined,
      solarradiation: r.solarradiation ?? undefined,
      baromrelin: r.baromrelin ?? undefined,
      dewPoint: r.dewpoint ?? undefined,
      dailyrainin: r.dailyrainin ?? undefined,
      hourlyrainin: r.hourlyrainin ?? undefined,
      date: r.date_iso,
      source: (r.source as WeatherSource) ?? 'station',
    }));
}

/**
 * Convert raw readings for rain processing — does NOT filter by tempf,
 * because rain data is independent of temperature. A station reboot
 * can produce readings with dailyrainin but null tempf; those must
 * still be counted for rainfall totals.
 */
function toRainReadings(raw: WeatherReadingRaw[]): WeatherReading[] {
  return raw
    .filter((r) => r.dailyrainin !== null || r.hourlyrainin !== null)
    .map((r) => ({
      dateutc: r.dateutc,
      tempf: r.tempf ?? 0,
      dailyrainin: r.dailyrainin ?? undefined,
      hourlyrainin: r.hourlyrainin ?? undefined,
      date: r.date_iso,
      source: (r.source as WeatherSource) ?? 'station',
    }));
}

/**
 * Filter readings by source preference.
 * For gap days (where source !== 'station'), only keep the preferred source type.
 * Real station data always passes through.
 */
function filterBySourcePreference(
  raw: WeatherReadingRaw[],
  preference: 'carry_forward' | 'fallback',
): WeatherReadingRaw[] {
  // Group readings by date to identify gap days
  const byDate = new Map<string, WeatherReadingRaw[]>();
  for (const r of raw) {
    const date = new Date(r.dateutc).toISOString().slice(0, 10);
    const arr = byDate.get(date) ?? [];
    arr.push(r);
    byDate.set(date, arr);
  }

  const result: WeatherReadingRaw[] = [];
  for (const [, readings] of byDate) {
    const hasStation = readings.some((r) => !r.source || r.source === 'station');
    if (hasStation) {
      // Real data day — only keep station readings
      result.push(...readings.filter((r) => !r.source || r.source === 'station'));
    } else {
      // Gap day — keep preferred source, fall back to whatever is available
      const preferred = readings.filter((r) => r.source === preference);
      if (preferred.length > 0) {
        result.push(...preferred);
      } else {
        // Use whatever gap-fill is available
        result.push(...readings);
      }
    }
  }

  return result.sort((a, b) => a.dateutc - b.dateutc);
}

export function useWeatherData(): UseWeatherDataResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<WeatherResult | null>(null);

  const fetchData = useCallback(async (
    sowingDate: string,
    stationMac?: string,
    baseTempF: number = 50,
    upperCapF: number | null = 86,
    gapPref: GapFillPreference = 'carry_forward',
  ): Promise<WeatherResult> => {
    setLoading(true);
    setError(null);

    try {
      const settings = getSettings();
      const mac = stationMac || settings.stationMac;

      if (!mac) {
        throw new Error('No weather station selected. Please choose a station in Settings.');
      }

      // Check cache first (skip if non-default gap preference — cache isn't source-aware)
      const cached = gapPref === 'carry_forward' ? getCachedWeatherData(mac, baseTempF) : null;
      if (cached && cached.gdd.length > 0) {
        const firstDate = cached.gdd[0].date;
        if (firstDate <= sowingDate) {
          const filteredGdd = cached.gdd.filter((d) => d.date >= sowingDate);
          let gddCum = 0;
          const recalcGdd = filteredGdd.map((d) => {
            gddCum += d.gdd;
            return { ...d, cumulative: Math.round(gddCum * 100) / 100 };
          });

          const filteredEto = cached.eto.filter((d) => d.date >= sowingDate);
          let etoCum = 0;
          const recalcEto = filteredEto.map((d) => {
            etoCum += d.eto;
            return { ...d, cumulative: Math.round(etoCum * 100) / 100 };
          });

          const filteredRain = (cached.rain || []).filter((d) => d.date >= sowingDate);
          let rainCum = 0;
          const recalcRain = filteredRain.map((d) => {
            rainCum += d.rain;
            return { ...d, cumulative: Math.round(rainCum * 100) / 100 };
          });

          const result: WeatherResult = { gdd: recalcGdd, eto: recalcEto, rain: recalcRain, dailySummaries: [] };
          setData(result);
          setLoading(false);
          return result;
        }
      }

      // Fetch from cPanel backend — single request, all data + gap-fills
      const allRaw = await getWeatherData(mac, sowingDate);
      const filteredRaw = filterBySourcePreference(allRaw, gapPref);
      const readings = toWeatherReadings(filteredRaw);
      const rainReadings = toRainReadings(filteredRaw);

      const gddData = processWeatherData(readings, sowingDate, baseTempF, upperCapF);
      const etoData = processEtoData(readings, sowingDate);
      const rainData = processRainData(rainReadings, sowingDate);
      const { summaries: dailySummaries } = aggregateDailySummaries(readings, sowingDate);

      // Cache the dataset
      const earliestDate = readings.length > 0
        ? new Date(readings[0].dateutc).toISOString().split('T')[0]
        : sowingDate;
      const allGddData = processWeatherData(readings, earliestDate, baseTempF, upperCapF);
      const allEtoData = processEtoData(readings, earliestDate);
      const allRainData = processRainData(rainReadings, earliestDate);
      setCachedWeatherData(mac, allGddData, allEtoData, allRainData, baseTempF);

      const result: WeatherResult = { gdd: gddData, eto: etoData, rain: rainData, dailySummaries };
      setData(result);
      setLoading(false);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch weather data';
      setError(message);
      setLoading(false);
      throw err;
    }
  }, []);

  return { loading, error, data, fetchData };
}
