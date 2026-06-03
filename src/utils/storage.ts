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

export function getCachedWeatherData(stationMac: string, baseTempF: number = 50): { gdd: DailyGdd[]; eto: DailyEto[]; rain: DailyRain[] } | null {
  const raw = localStorage.getItem(WEATHER_CACHE_KEY);
  if (!raw) return null;
  try {
    const cache = JSON.parse(raw) as Record<string, CachedWeather | { data: DailyGdd[]; timestamp: number }>;
    const cacheKey = `${stationMac}:${baseTempF}`;
    const entry = cache[cacheKey] || cache[stationMac]; // fallback to old key for migration
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

export function setCachedWeatherData(stationMac: string, gdd: DailyGdd[], eto: DailyEto[], rain: DailyRain[] = [], baseTempF: number = 50): void {
  const raw = localStorage.getItem(WEATHER_CACHE_KEY);
  const cache = raw ? JSON.parse(raw) : {};
  const cacheKey = `${stationMac}:${baseTempF}`;
  cache[cacheKey] = { gdd, eto, rain, timestamp: Date.now() };
  // Clean up old un-keyed entry if exists
  if (cache[stationMac] && stationMac !== cacheKey) delete cache[stationMac];
  try {
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage full — clear old cache and try again
    localStorage.removeItem(WEATHER_CACHE_KEY);
    const fresh: Record<string, CachedWeather> = {};
    fresh[cacheKey] = { gdd, eto, rain, timestamp: Date.now() };
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
