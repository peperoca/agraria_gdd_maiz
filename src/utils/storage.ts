import type { Field, AppSettings, DailyGdd, ExportData } from '../types';

const SETTINGS_KEY = 'corn-gdd-settings';
const FIELDS_KEY = 'corn-gdd-fields';
const WEATHER_CACHE_KEY = 'corn-gdd-weather-cache';

// --- Settings ---

export function getSettings(): AppSettings {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    return { apiKey: '', applicationKey: '', stationMac: '', stationName: '' };
  }
  return JSON.parse(raw);
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// --- Fields ---

export function getFields(): Field[] {
  const raw = localStorage.getItem(FIELDS_KEY);
  if (!raw) return [];
  return JSON.parse(raw);
}

export function saveFields(fields: Field[]): void {
  localStorage.setItem(FIELDS_KEY, JSON.stringify(fields));
}

export function addField(field: Omit<Field, 'id' | 'createdAt'>): Field {
  const fields = getFields();
  const newField: Field = {
    ...field,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  fields.push(newField);
  saveFields(fields);
  return newField;
}

export function updateField(id: string, updates: Partial<Field>): void {
  const fields = getFields();
  const idx = fields.findIndex((f) => f.id === id);
  if (idx >= 0) {
    fields[idx] = { ...fields[idx], ...updates };
    saveFields(fields);
  }
}

export function deleteField(id: string): void {
  const fields = getFields().filter((f) => f.id !== id);
  saveFields(fields);
}

// --- Weather Cache ---

export function getCachedWeatherData(stationMac: string): DailyGdd[] | null {
  const raw = localStorage.getItem(WEATHER_CACHE_KEY);
  if (!raw) return null;
  const cache = JSON.parse(raw) as Record<string, { data: DailyGdd[]; timestamp: number }>;
  const entry = cache[stationMac];
  if (!entry) return null;

  // Cache is valid for 1 hour
  const ONE_HOUR = 60 * 60 * 1000;
  if (Date.now() - entry.timestamp > ONE_HOUR) return null;

  return entry.data;
}

export function setCachedWeatherData(stationMac: string, data: DailyGdd[]): void {
  const raw = localStorage.getItem(WEATHER_CACHE_KEY);
  const cache = raw ? JSON.parse(raw) : {};
  cache[stationMac] = { data, timestamp: Date.now() };
  localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(cache));
}

// --- Export / Import ---

export function exportData(): string {
  const settings = getSettings();
  const fields = getFields();
  const raw = localStorage.getItem(WEATHER_CACHE_KEY);
  const weatherCache = raw ? JSON.parse(raw) : {};

  // Strip timestamps from cache for export, keep only data
  const cleanCache: Record<string, DailyGdd[]> = {};
  for (const [key, value] of Object.entries(weatherCache)) {
    cleanCache[key] = (value as { data: DailyGdd[] }).data;
  }

  const exportObj: ExportData = {
    version: 1,
    exportDate: new Date().toISOString(),
    settings: { ...settings, apiKey: '', applicationKey: '' }, // Don't export keys
    fields,
    weatherCache: cleanCache,
  };

  return JSON.stringify(exportObj, null, 2);
}

export function importData(jsonString: string): { success: boolean; message: string } {
  try {
    const data = JSON.parse(jsonString) as ExportData;

    if (data.version !== 1) {
      return { success: false, message: 'Unsupported export version' };
    }

    // Import fields (merge with existing, avoid duplicates by id)
    const existingFields = getFields();
    const existingIds = new Set(existingFields.map((f) => f.id));
    const newFields = data.fields.filter((f) => !existingIds.has(f.id));
    saveFields([...existingFields, ...newFields]);

    // Import station selection (but not API keys)
    const settings = getSettings();
    if (data.settings.stationMac && !settings.stationMac) {
      saveSettings({ ...settings, stationMac: data.settings.stationMac, stationName: data.settings.stationName });
    }

    // Import weather cache
    if (data.weatherCache) {
      const raw = localStorage.getItem(WEATHER_CACHE_KEY);
      const cache = raw ? JSON.parse(raw) : {};
      for (const [key, value] of Object.entries(data.weatherCache)) {
        if (!cache[key]) {
          cache[key] = { data: value, timestamp: Date.now() };
        }
      }
      localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(cache));
    }

    return {
      success: true,
      message: `Imported ${newFields.length} new field(s). ${data.fields.length - newFields.length} already existed.`,
    };
  } catch {
    return { success: false, message: 'Invalid file format' };
  }
}

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
