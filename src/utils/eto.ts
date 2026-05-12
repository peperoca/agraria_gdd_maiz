import type { WeatherReading, DailyWeatherSummary, DailyEto } from '../types';
import { getStationLocalDate } from './stationTime';

/**
 * FAO Penman-Monteith Reference Evapotranspiration (ETo) Calculator
 *
 * Based on FAO Irrigation and Drainage Paper 56
 * https://www.fao.org/4/x0490e/x0490e00.htm
 */

// ── Unit conversion helpers ──

function fToC(f: number): number {
  return (f - 32) * 5 / 9;
}

function mphToMs(mph: number): number {
  return mph * 0.44704;
}

function inHgToKpa(inHg: number): number {
  return inHg * 3.38639;
}

// ── Intermediate calculations ──

/**
 * Saturation vapor pressure (kPa) from temperature (°C)
 * Tetens/Magnus formula
 */
function satVaporPressure(tC: number): number {
  return 0.6108 * Math.exp((17.27 * tC) / (tC + 237.3));
}

/**
 * Slope of saturation vapor pressure curve (kPa/°C)
 */
function slopeVaporPressureCurve(tC: number): number {
  const es = satVaporPressure(tC);
  return (4098 * es) / Math.pow(tC + 237.3, 2);
}

/**
 * Psychrometric constant (kPa/°C)
 */
function psychrometricConstant(pressureKpa: number): number {
  return 0.000665 * pressureKpa;
}

/**
 * Net shortwave radiation (MJ/m²/day)
 * albedo = 0.23 for reference grass
 */
function netShortwaveRadiation(rsMJ: number): number {
  return (1 - 0.23) * rsMJ;
}

/**
 * Net longwave radiation (MJ/m²/day)
 * Simplified: uses measured Rs and estimated Rso
 */
function netLongwaveRadiation(
  tmaxC: number,
  tminC: number,
  ea: number,
  rsMJ: number,
  rsoMJ: number
): number {
  const sigma = 4.903e-9; // Stefan-Boltzmann MJ/K⁴/m²/day
  const tmaxK = tmaxC + 273.16;
  const tminK = tminC + 273.16;

  const tempFactor = (Math.pow(tmaxK, 4) + Math.pow(tminK, 4)) / 2;
  const humidityFactor = 0.34 - 0.14 * Math.sqrt(ea);

  // Cloudiness factor — clamp Rs/Rso to [0.25, 1]
  const rsRatio = rsoMJ > 0 ? Math.min(Math.max(rsMJ / rsoMJ, 0.25), 1.0) : 0.5;
  const cloudFactor = 1.35 * rsRatio - 0.35;

  return sigma * tempFactor * humidityFactor * cloudFactor;
}

/**
 * Extraterrestrial radiation Ra (MJ/m²/day) for a given latitude and day of year.
 * Simplified seasonal approximation.
 */
function extraterrestrialRadiation(latitude: number, dayOfYear: number): number {
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * dayOfYear) / 365);
  const delta = 0.409 * Math.sin((2 * Math.PI * dayOfYear) / 365 - 1.39);
  const phi = (latitude * Math.PI) / 180;

  const ws = Math.acos(-Math.tan(phi) * Math.tan(delta));
  const Gsc = 0.0820; // Solar constant MJ/m²/min

  return (
    ((24 * 60) / Math.PI) *
    Gsc *
    dr *
    (ws * Math.sin(phi) * Math.sin(delta) +
      Math.cos(phi) * Math.cos(delta) * Math.sin(ws))
  );
}

// ── Daily aggregation ──

/**
 * Aggregate 5-minute weather readings into daily summaries.
 */
export function aggregateDailySummaries(
  readings: WeatherReading[],
  startDate: string
): DailyWeatherSummary[] {
  const byDate = new Map<string, WeatherReading[]>();

  for (const r of readings) {
    if (r.tempf == null || isNaN(r.tempf)) continue;
    const dateStr = getStationLocalDate(r.dateutc);
    if (dateStr < startDate) continue;

    if (!byDate.has(dateStr)) byDate.set(dateStr, []);
    byDate.get(dateStr)!.push(r);
  }

  const dates = Array.from(byDate.keys()).sort();
  const summaries: DailyWeatherSummary[] = [];

  for (const date of dates) {
    const rds = byDate.get(date)!;
    const temps = rds.map((r) => r.tempf).filter((t) => !isNaN(t));
    const humidities = rds.map((r) => r.humidity).filter((h) => h != null && !isNaN(h)) as number[];
    const winds = rds.map((r) => r.windspeedmph).filter((w) => w != null && !isNaN(w)) as number[];
    const solars = rds.map((r) => r.solarradiation).filter((s) => s != null && !isNaN(s)) as number[];
    const pressures = rds.map((r) => r.baromrelin).filter((p) => p != null && !isNaN(p)) as number[];
    const dewPoints = rds.map((r) => r.dewPoint).filter((d) => d != null && !isNaN(d)) as number[];

    if (temps.length === 0) continue;

    const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;

    summaries.push({
      date,
      tempMaxF: Math.max(...temps),
      tempMinF: Math.min(...temps),
      tempMeanF: mean(temps),
      humidityMean: humidities.length > 0 ? mean(humidities) : 60,   // default 60% if missing
      windSpeedMeanMph: winds.length > 0 ? mean(winds) : 2,          // default 2 mph
      solarRadiationMeanWm2: solars.length > 0 ? mean(solars) : 150, // default
      pressureMeanInHg: pressures.length > 0 ? mean(pressures) : 29.92,
      dewPointMeanF: dewPoints.length > 0 ? mean(dewPoints) : 50,
      readingCount: rds.length,
    });
  }

  return summaries;
}

// ── Main ETo calculation ──

/**
 * Calculate daily ETo using FAO Penman-Monteith method.
 *
 * @param summaries - Daily weather summaries
 * @param latitude - Station latitude in degrees (default -34.5 for Uruguay)
 * @param elevation - Station elevation in meters (default 50m)
 */
export function calculateDailyEto(
  summaries: DailyWeatherSummary[],
  latitude: number = -34.5,
  elevation: number = 50
): DailyEto[] {
  const results: DailyEto[] = [];
  let cumulative = 0;

  for (const day of summaries) {
    // Convert units
    const tmeanC = fToC(day.tempMeanF);
    const tmaxC = fToC(day.tempMaxF);
    const tminC = fToC(day.tempMinF);
    const u2 = mphToMs(day.windSpeedMeanMph);
    const P = inHgToKpa(day.pressureMeanInHg);

    // Solar radiation: convert mean W/m² to daily total MJ/m²/day
    // Mean W/m² × 0.0864 = MJ/m²/day (for 24h average)
    // But solarradiation from WS-2902C is instantaneous, so we use integration:
    // If we have N readings at 5-min intervals, total energy = mean × 86400 / 1e6
    const rsMJ = day.solarRadiationMeanWm2 * 0.0864;

    // Day of year
    const doy = getDayOfYear(day.date);

    // Extraterrestrial radiation
    const ra = extraterrestrialRadiation(latitude, doy);

    // Clear-sky radiation
    const rso = (0.75 + 2e-5 * elevation) * ra;

    // Saturation vapor pressure (average of es at Tmax and es at Tmin)
    const esMax = satVaporPressure(tmaxC);
    const esMin = satVaporPressure(tminC);
    const es = (esMax + esMin) / 2;

    // Actual vapor pressure from humidity
    const ea = (day.humidityMean / 100) * satVaporPressure(tmeanC);

    // Slope of saturation vapor pressure curve
    const delta = slopeVaporPressureCurve(tmeanC);

    // Psychrometric constant
    const gamma = psychrometricConstant(P);

    // Net radiation
    const rns = netShortwaveRadiation(rsMJ);
    const rnl = netLongwaveRadiation(tmaxC, tminC, ea, rsMJ, rso);
    const rn = rns - rnl;

    // FAO Penman-Monteith equation (G = 0 for daily)
    const numerator =
      0.408 * delta * rn +
      gamma * (900 / (tmeanC + 273)) * u2 * (es - ea);
    const denominator = delta + gamma * (1 + 0.34 * u2);

    let eto = numerator / denominator;

    // Clamp to reasonable range [0, 15] mm/day
    eto = Math.max(0, Math.min(eto, 15));
    eto = Math.round(eto * 100) / 100;

    cumulative += eto;

    results.push({
      date: day.date,
      eto,
      cumulative: Math.round(cumulative * 100) / 100,
    });
  }

  return results;
}

function getDayOfYear(dateStr: string): number {
  const d = new Date(dateStr);
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Process raw weather readings into daily ETo data.
 */
export function processEtoData(
  readings: WeatherReading[],
  startDate: string,
  latitude?: number,
  elevation?: number
): DailyEto[] {
  const summaries = aggregateDailySummaries(readings, startDate);
  return calculateDailyEto(summaries, latitude, elevation);
}
