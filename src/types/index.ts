export interface Field {
  id: number;
  name: string;
  sowingDate: string; // ISO date string YYYY-MM-DD
  cropType: 'corn' | 'soybean' | 'wheat';
  stationMac: string;
  stationName?: string;
  farmId?: number;
  createdAt: string;
}

export interface Farm {
  id: number;
  name: string;
  latitude: number | null;
  longitude: number | null;
  stationMac: string | null;
  stationName: string | null;
  createdAt: string;
}

export interface WeatherReading {
  dateutc: number;        // Unix timestamp ms
  tempf: number;          // Outdoor temperature °F
  humidity?: number;      // Outdoor relative humidity %
  windspeedmph?: number;  // Wind speed mph
  solarradiation?: number;// Solar radiation W/m²
  baromrelin?: number;    // Relative barometric pressure inHg
  dewPoint?: number;      // Dew point °F
  dailyrainin?: number;   // Daily rain accumulation (inches, resets at midnight)
  hourlyrainin?: number;  // Hourly rain (inches)
  date: string;           // ISO date string from API
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

export interface DailyEto {
  date: string;       // YYYY-MM-DD
  eto: number;        // Daily ETo (mm/day)
  cumulative: number; // Cumulative ETo (mm)
}

export interface DailyRain {
  date: string;       // YYYY-MM-DD
  rain: number;       // Daily rainfall (mm)
  cumulative: number; // Cumulative rainfall (mm)
}

export interface DailyWeatherSummary {
  date: string;
  tempMaxF: number;
  tempMinF: number;
  tempMeanF: number;
  humidityMean: number;
  windSpeedMeanMph: number;
  solarRadiationMeanWm2: number;
  pressureMeanInHg: number;
  dewPointMeanF: number;
  readingCount: number;
}

export interface CornStage {
  name: string;
  shortName: string;
  gdd: number;
  description: string;
}

export interface StationInfo {
  mac: string;
  name: string;
  latitude: number;
  longitude: number;
  elevationM: number;
}

export interface User {
  id: number;
  username: string;
  email: string;
  role: 'user' | 'admin';
}

export interface AdminUser extends User {
  createdAt: string;
  fieldCount: number;
}

export interface AdminStation {
  id: number;
  mac: string;
  name: string;
  apiKey: string;
  applicationKey: string;
  latitude: number;
  longitude: number;
  elevationM: number;
  isActive: boolean;
  createdAt: string;
}

export interface AppSettings {
  stationMac: string;
  stationName: string;
}

export interface ExportData {
  version: number;
  exportDate: string;
  fields: Field[];
  weatherCache: Record<string, DailyGdd[]>;
}
