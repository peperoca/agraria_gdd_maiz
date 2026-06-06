export interface FieldPolygon {
  type: 'Polygon';
  coordinates: number[][][]; // GeoJSON Polygon coordinates
}

export interface Field {
  id: number;
  name: string;
  sowingDate: string; // From active season (or legacy field column)
  cropType: string;   // From active season (or legacy field column)
  polygon: FieldPolygon | null;
  stationMac: string;
  stationName?: string;
  farmId?: number;
  createdAt: string;
  // Soil water balance (permanent field properties)
  tawMm: number | null;
  madPct: number | null;
  tawSource: 'coneat_mm' | 'coneat_apdn' | 'manual' | null;
  coneatGc: string | null;
  initialAswMm: number | null;
  // Active season reference
  seasonId?: number | null;
  // Station change tracking
  previousStationMac?: string | null;
  previousStationName?: string | null;
  stationChangedAt?: string | null;  // YYYY-MM-DD
  // Notes
  notes?: string | null;
  notesUpdatedAt?: string | null;
}

export interface Season {
  id: number;
  fieldId: number;
  cropType: string;
  sowingDate: string;
  endDate: string | null;
  isActive: boolean;
  initialAswMm: number | null;
  createdAt: string;
}

export interface Farm {
  id: number;
  name: string;
  latitude: number | null;
  longitude: number | null;
  stationMac: string | null;
  stationName: string | null;
  stationDistanceKm?: number | null;
  createdAt: string;
  access?: 'owner' | 'shared' | 'admin';
  ownerUsername?: string | null;
}

export interface Share {
  id: number;
  entityType: 'farm' | 'field';
  entityId: number;
  ownerId: number;
  sharedWithId: number;
  sharedWithUsername: string;
  createdAt: string;
}

export type WeatherSource = 'station' | 'carry_forward' | 'fallback' | 'manual';

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
  source?: WeatherSource; // Data origin: real station, carry-forward, or fallback
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
  source?: WeatherSource; // Dominant source for this day's readings
}

export interface DailyEto {
  date: string;       // YYYY-MM-DD
  eto: number;        // Daily ETo (mm/day)
  cumulative: number; // Cumulative ETo (mm)
  source?: WeatherSource;
}

export interface DailyRain {
  date: string;       // YYYY-MM-DD
  rain: number;       // Daily rainfall (mm)
  cumulative: number; // Cumulative rainfall (mm)
  source?: WeatherSource;
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
  /** Soybean only: PTU threshold for this stage */
  ptu?: number;
  /** Wheat only: cumulative vernalization hours (Vd) threshold */
  vd?: number;
}

export interface StationInfo {
  id?: number;
  mac: string;
  name: string;
  latitude: number;
  longitude: number;
  elevationM: number;
  distanceKm?: number | null;
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

export interface NdviReading {
  date: string;       // YYYY-MM-DD
  ndviMean: number;
  kc: number;
  cloudPct: number | null;
}

export interface DailyETc {
  date: string;       // YYYY-MM-DD
  etc: number;        // Daily ETc (mm/day)
  cumulative: number; // Cumulative ETc (mm)
  kcSource?: 'fao' | 'ndvi';
}

export interface SoilMoistureReading {
  date: string;              // YYYY-MM-DD
  vvDb: number;              // Vegetation-corrected VV backscatter (dB)
  vhDb: number | null;       // VH backscatter (dB)
  vvRawDb: number;           // Uncorrected VV (dB)
  ndviUsed: number | null;   // NDVI value used for correction
  smRelative: number | null; // 0-100% relative soil moisture (null if bootstrapping)
  vvDry: number | null;      // Running min VV at computation time
  vvWet: number | null;      // Running max VV at computation time
}

export interface IrrigationEquipment {
  id: number;
  farmId: number;
  name: string;
  serialNumber: string | null;
  reportUrl: string | null;
  areaHa: number | null;
  type: string;
  isActive: boolean;
  createdAt: string;
}

export interface IrrigationAssignment {
  id: number;
  equipmentId: number;
  equipmentName?: string;
  fieldId: number;
  fieldName?: string;
  startDate: string;
  endDate: string | null;
  createdAt: string;
}

export interface DailyIrrigation {
  date: string;
  depthMm: number;
}

export interface DailyASW {
  date: string;
  asw: number;              // Available Soil Water (mm), bounded 0–TAW
  rain: number;             // Daily rain input (mm)
  irrigation: number;       // Daily irrigation input (mm)
  etc: number;              // Daily ETc (mm)
  excess: number;           // Drainage/runoff when ASW would exceed TAW (mm)
  cumulativeExcess: number; // Running total of excess from sowing
  taw: number;              // Total Available Water reference (mm)
  madThreshold: number;     // ASW level triggering irrigation advisory (mm)
}

export interface ConeatSoil {
  gc_code: string;
  mm: number;
  apdn: number;
  ip: number;
  geometry?: { type: string; coordinates: number[][][][] };
}

export interface FieldOverride {
  date: string;
  rainMm: number | null;
  irrigationMm: number | null;
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
