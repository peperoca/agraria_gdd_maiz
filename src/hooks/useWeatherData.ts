import { useState, useCallback } from 'react';
import type { DailyGdd, WeatherReading } from '../types';
import { processWeatherData } from '../utils/gdd';
import { getCachedWeatherData, setCachedWeatherData, getSettings } from '../utils/storage';

interface UseWeatherDataResult {
  loading: boolean;
  error: string | null;
  data: DailyGdd[] | null;
  fetchData: (sowingDate: string) => Promise<DailyGdd[]>;
}

export function useWeatherData(): UseWeatherDataResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DailyGdd[] | null>(null);

  const fetchData = useCallback(async (sowingDate: string): Promise<DailyGdd[]> => {
    const settings = getSettings();
    if (!settings.apiKey || !settings.applicationKey || !settings.stationMac) {
      throw new Error('Please configure your API keys and weather station in Settings.');
    }

    setLoading(true);
    setError(null);

    try {
      // Check cache first
      const cached = getCachedWeatherData(settings.stationMac);
      if (cached && cached.length > 0) {
        // Check if cache covers the sowing date
        const firstDate = cached[0].date;
        if (firstDate <= sowingDate) {
          const filtered = cached.filter((d) => d.date >= sowingDate);
          // Recalculate cumulative from sowing date
          let cumulative = 0;
          const recalculated = filtered.map((d) => {
            cumulative += d.gdd;
            return { ...d, cumulative: Math.round(cumulative * 100) / 100 };
          });
          setData(recalculated);
          setLoading(false);
          return recalculated;
        }
      }

      // Fetch from API
      const readings = await fetchAllReadings(
        settings.stationMac,
        sowingDate
      );

      const gddData = processWeatherData(readings, sowingDate);

      // Cache the full dataset (not filtered by sowing date)
      const allGddData = processWeatherData(readings, readings.length > 0
        ? new Date(readings[0].dateutc).toISOString().split('T')[0]
        : sowingDate);
      setCachedWeatherData(settings.stationMac, allGddData);

      setData(gddData);
      setLoading(false);
      return gddData;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch weather data';
      setError(message);
      setLoading(false);
      throw err;
    }
  }, []);

  return { loading, error, data, fetchData };
}

/**
 * Fetch all weather readings from sowing date to now.
 * Paginates through the Ambient Weather API (max 288 records per request).
 */
async function fetchAllReadings(
  stationMac: string,
  sowingDate: string
): Promise<WeatherReading[]> {
  const allReadings: WeatherReading[] = [];
  const sowingTimestamp = new Date(sowingDate).getTime();
  let endDate: string | undefined = undefined;
  let attempts = 0;
  const MAX_ATTEMPTS = 100; // Safety limit

  while (attempts < MAX_ATTEMPTS) {
    attempts++;

    const params = new URLSearchParams({
      mac: stationMac,
      limit: '288',
    });
    if (endDate) {
      params.set('endDate', endDate);
    }

    const response = await fetch(`/api/weather-history?${params}`);
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`API error: ${response.status} - ${body}`);
    }

    const readings: WeatherReading[] = await response.json();

    if (readings.length === 0) break;

    allReadings.push(...readings);

    // Check if we've gone far enough back
    const oldestTimestamp = Math.min(...readings.map((r) => r.dateutc));
    if (oldestTimestamp <= sowingTimestamp) break;

    // Set endDate for next page (oldest reading minus 1ms)
    endDate = new Date(oldestTimestamp - 1).toISOString();

    // Rate limit: wait 1.1 seconds between requests
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }

  // Sort chronologically
  allReadings.sort((a, b) => a.dateutc - b.dateutc);

  return allReadings;
}
