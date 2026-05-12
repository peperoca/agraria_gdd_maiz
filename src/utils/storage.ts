import type { AppSettings, DailyGdd, DailyEto, DailyRain } from '../types';

const SETTINGS_KEY = 'corn-gdd-settings';
const WEATHER_CACHE_KEY = 'corn-gdd-weather-cache';

// --- Settings (station selection only, no API keys) ---

export function getSettings(): AppSettings {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    return { stationMac: '', stationName: '' };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      stationMac: parsed.stationMac || '',
      stationName: parsed.stationName || '',
    };
  } catch {
    return { stationMac: '', stationName: '' };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// --- Weather Cache ---

interface CachedWeather {
  gdd: DailyGdd[];
  eto: DailyEto[];
  rain: DailyRain[];
  timestamp: number;
}

export function getCachedWeatherData(stationMac: string): { gdd: DailyGdd[]; eto: DailyEto[]; rain: DailyRain[] } | null {
  const raw = localStorage.getItem(WEATHER_CACHE_KEY);
  if (!raw) return null;
  try {
    const cache = JSON.parse(raw) as Record<string, CachedWeather | { data: DailyGdd[]; timestamp: number }>;
    const entry = cache[stationMac];
    if (!entry) return null;

    // Cache is valid for 1 hour
    const ONE_HOUR = 60 * 60 * 1000;
    if (Date.now() - entry.timestamp > ONE_HOUR) return null;

    // Support old cache format (data only) and new format (gdd + eto)
    if ('gdd' in entry) {
      return { gdd: entry.gdd, eto: entry.eto, rain: (entry as CachedWeather).rain || [] };
    }
    // Legacy format
    return { gdd: (entry as { data: DailyGdd[] }).data, eto: [], rain: [] };
  } catch {
    return null;
  }
}

export function setCachedWeatherData(stationMac: string, gdd: DailyGdd[], eto: DailyEto[], rain: DailyRain[] = []): void {
  const raw = localStorage.getItem(WEATHER_CACHE_KEY);
  const cache = raw ? JSON.parse(raw) : {};
  cache[stationMac] = { gdd, eto, rain, timestamp: Date.now() };
  try {
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage full — clear old cache and try again
    localStorage.removeItem(WEATHER_CACHE_KEY);
    const fresh: Record<string, CachedWeather> = {};
    fresh[stationMac] = { gdd, eto, rain, timestamp: Date.now() };
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(fresh));
  }
}

// --- Utility ---

export function downloadJson(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
