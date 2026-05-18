/**
 * HTTP client for the cPanel backend API
 */

const API_BASE = import.meta.env.VITE_API_URL || 'https://www.valleychaco.com.py/gdd-api/api';

function getToken(): string | null {
  return localStorage.getItem('corn-gdd-token');
}

export function setToken(token: string): void {
  localStorage.setItem('corn-gdd-token', token);
}

export function clearToken(): void {
  localStorage.removeItem('corn-gdd-token');
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}/${endpoint}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error('Session expired');
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `API error ${res.status}`);
  }

  return data as T;
}

// --- Auth ---

interface AuthResponse {
  token: string;
  user: { id: number; username: string; email: string; role: 'user' | 'admin' };
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>('login.php', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setToken(data.token);
  return data;
}

export async function register(username: string, email: string, password: string): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>('register.php', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  });
  setToken(data.token);
  return data;
}

export async function logout(): Promise<void> {
  try {
    await apiFetch('logout.php', { method: 'POST' });
  } catch {
    // Ignore errors on logout
  }
  clearToken();
}

export async function getMe(): Promise<{ id: number; username: string; email: string; role: 'user' | 'admin' }> {
  return apiFetch('me.php');
}

// --- Stations ---

export interface StationInfo {
  mac: string;
  name: string;
  latitude: number;
  longitude: number;
  elevationM: number;
}

export async function getStations(): Promise<StationInfo[]> {
  return apiFetch<StationInfo[]>('stations.php');
}

// --- Farms ---

export interface ServerFarm {
  id: number;
  name: string;
  latitude: number | null;
  longitude: number | null;
  stationMac: string | null;
  stationName: string | null;
  createdAt: string;
}

export async function getFarms(): Promise<ServerFarm[]> {
  return apiFetch<ServerFarm[]>('farms.php');
}

export async function createFarm(data: { name: string; latitude?: number; longitude?: number }): Promise<ServerFarm> {
  return apiFetch<ServerFarm>('farms.php', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateFarm(id: number, data: Record<string, unknown>): Promise<ServerFarm> {
  return apiFetch<ServerFarm>(`farm.php?id=${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteFarm(id: number): Promise<{ success: boolean }> {
  return apiFetch(`farm.php?id=${id}`, {
    method: 'DELETE',
  });
}

// --- Fields ---

export interface ServerField {
  id: number;
  name: string;
  sowingDate: string;
  cropType: 'corn' | 'soybean' | 'wheat';
  polygon: { type: 'Polygon'; coordinates: number[][][] } | null;
  stationMac: string;
  stationName?: string;
  farmId?: number;
  createdAt: string;
}

export async function getFields(farmId?: number): Promise<ServerField[]> {
  const params = farmId ? `?farm_id=${farmId}` : '';
  return apiFetch<ServerField[]>(`fields.php${params}`);
}

export async function createField(
  name: string, sowingDate: string, stationMac: string,
  cropType: string = 'corn', farmId?: number,
  polygon?: { type: 'Polygon'; coordinates: number[][][] } | null,
): Promise<ServerField> {
  return apiFetch<ServerField>('fields.php', {
    method: 'POST',
    body: JSON.stringify({ name, sowingDate, stationMac, cropType, farmId, polygon }),
  });
}

export async function updateField(id: number, data: {
  name?: string; sowingDate?: string; cropType?: string;
  polygon?: { type: 'Polygon'; coordinates: number[][][] } | null;
}): Promise<{ success: boolean }> {
  return apiFetch(`field.php?id=${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteField(id: number): Promise<{ success: boolean }> {
  return apiFetch(`field.php?id=${id}`, {
    method: 'DELETE',
  });
}

// --- Weather Data ---

export type WeatherSource = 'station' | 'carry_forward' | 'fallback';

export interface WeatherReadingRaw {
  dateutc: number;
  tempf: number | null;
  humidity: number | null;
  windspeedmph: number | null;
  solarradiation: number | null;
  baromrelin: number | null;
  dewpoint: number | null;
  dailyrainin: number | null;
  hourlyrainin: number | null;
  date_iso: string;
  source?: WeatherSource;
}

export interface WeatherGapInfo {
  gap_date: string;
  has_carry_forward: boolean;
  has_fallback: boolean;
  fallback_station_name: string | null;
  fallback_distance_km: number | null;
  resolved_at: string | null;
}

export async function getWeatherData(
  stationMac: string,
  from: string,
  to?: string
): Promise<WeatherReadingRaw[]> {
  const params = new URLSearchParams({ mac: stationMac, from });
  if (to) params.set('to', to);
  return apiFetch<WeatherReadingRaw[]>(`weather.php?${params}`);
}

export async function getWeatherGaps(stationMac: string): Promise<WeatherGapInfo[]> {
  return apiFetch<WeatherGapInfo[]>(`weather-gaps.php?mac=${encodeURIComponent(stationMac)}`);
}

// --- NDVI ---

export interface NdviReadingRaw {
  date: string;
  ndvi_mean: number;
  kc: number;
  cloud_pct: number | null;
}

export async function getNdviData(fieldId: number): Promise<NdviReadingRaw[]> {
  return apiFetch<NdviReadingRaw[]>(`ndvi.php?field_id=${fieldId}`);
}

// --- Soil Moisture ---

export interface SoilMoistureReadingRaw {
  date: string;
  vv_db: number;
  vh_db: number | null;
  vv_raw_db: number;
  ndvi_used: number | null;
  sm_relative: number | null;
  vv_dry: number | null;
  vv_wet: number | null;
}

export async function getSoilMoistureData(fieldId: number): Promise<SoilMoistureReadingRaw[]> {
  return apiFetch<SoilMoistureReadingRaw[]>(`soil-moisture.php?field_id=${fieldId}`);
}

// --- Admin ---

import type { AdminUser, AdminStation } from '../types';

export async function getAdminUsers(): Promise<AdminUser[]> {
  const raw = await apiFetch<Array<Record<string, unknown>>>('admin/users.php');
  return raw.map((u) => ({
    id: u.id as number,
    username: u.username as string,
    email: u.email as string,
    role: u.role as 'user' | 'admin',
    createdAt: u.created_at as string,
    fieldCount: u.field_count as number,
  }));
}

export async function updateUserRole(userId: number, role: 'user' | 'admin'): Promise<void> {
  await apiFetch(`admin/users.php?id=${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  });
}

export async function getAdminStations(): Promise<AdminStation[]> {
  const raw = await apiFetch<Array<Record<string, unknown>>>('admin/stations.php');
  return raw.map((s) => ({
    id: s.id as number,
    mac: s.mac as string,
    name: s.name as string,
    apiKey: s.api_key as string,
    applicationKey: s.application_key as string,
    latitude: s.latitude as number,
    longitude: s.longitude as number,
    elevationM: s.elevation_m as number,
    isActive: s.is_active as boolean,
    createdAt: s.created_at as string,
  }));
}

export async function createStation(data: {
  mac: string; name: string; apiKey: string; applicationKey: string;
  latitude: number; longitude: number; elevationM: number;
}): Promise<void> {
  await apiFetch('admin/stations.php', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateStation(id: number, data: Record<string, unknown>): Promise<void> {
  await apiFetch(`admin/stations.php?id=${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deactivateStation(id: number): Promise<void> {
  await apiFetch(`admin/stations.php?id=${id}`, {
    method: 'DELETE',
  });
}
