export interface Field {
  id: string;
  name: string;
  sowingDate: string; // ISO date string YYYY-MM-DD
  stationMac: string;
  createdAt: string;
}

export interface WeatherReading {
  dateutc: number; // Unix timestamp ms
  tempf: number;   // Outdoor temperature °F
  date: string;    // ISO date string from API
}

export interface HourlyTemp {
  date: string;    // YYYY-MM-DD
  hour: number;    // 0-23
  avgTempF: number;
}

export interface DailyGdd {
  date: string;    // YYYY-MM-DD
  gdd: number;     // Daily GDD
  cumulative: number; // Cumulative GDD from sowing
  hourlyTemps: number[]; // 24 hourly avg temps for detail view
}

export interface CornStage {
  name: string;
  shortName: string;
  gdd: number;
  description: string;
}

export interface DeviceInfo {
  macAddress: string;
  info: {
    name: string;
    location?: string;
  };
  lastData: {
    dateutc: number;
    tempf?: number;
  };
}

export interface AppSettings {
  apiKey: string;
  applicationKey: string;
  stationMac: string;
  stationName: string;
}

export interface ExportData {
  version: number;
  exportDate: string;
  settings: AppSettings;
  fields: Field[];
  weatherCache: Record<string, DailyGdd[]>; // keyed by stationMac
}
