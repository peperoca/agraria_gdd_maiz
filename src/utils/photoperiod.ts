import type { DailyGdd } from '../types';

export interface DaylengthDay {
  date: string;
  daylengthHours: number;
}

export interface PtuDay {
  date: string;
  dailyPtu: number;
  cumulativePtu: number;
  daylength: number;
}

export interface PhotoperiodAlert {
  type: 'info' | 'warning';
  message: string;
  currentDaylength: number;
  criticalThreshold: number;
}

/**
 * Calculate day of year from ISO date string (1-based).
 */
export function getDayOfYear(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00');
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Calculate daylength in hours from latitude and day of year.
 * Uses the CBM (simplified) solar declination model.
 * Pure astronomical calculation — no weather data needed.
 *
 * @param latitude - farm latitude in decimal degrees (negative for southern hemisphere)
 * @param dayOfYear - 1-365/366
 * @returns daylength in hours (0-24)
 */
export function calculateDaylength(latitude: number, dayOfYear: number): number {
  const DEG2RAD = Math.PI / 180;

  // Solar declination (degrees)
  const declination = 23.45 * Math.sin(DEG2RAD * (360 / 365) * (284 + dayOfYear));

  const latRad = latitude * DEG2RAD;
  const declRad = declination * DEG2RAD;

  // Hour angle at sunrise/sunset
  const cosHourAngle = -Math.tan(latRad) * Math.tan(declRad);

  // Handle polar day/night
  if (cosHourAngle < -1) return 24; // midnight sun
  if (cosHourAngle > 1) return 0;   // polar night

  const hourAngle = Math.acos(cosHourAngle) / DEG2RAD; // in degrees
  return (2 * hourAngle) / 15; // convert to hours (15° per hour)
}

/**
 * Generate a daylength time series for charting.
 */
export function calculateDaylengthSeries(
  latitude: number,
  startDate: string,
  endDate: string,
): DaylengthDay[] {
  const result: DaylengthDay[] = [];
  const current = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');

  while (current <= end) {
    const dateStr = current.toISOString().slice(0, 10);
    const doy = getDayOfYear(dateStr);
    result.push({ date: dateStr, daylengthHours: calculateDaylength(latitude, doy) });
    current.setDate(current.getDate() + 1);
  }

  return result;
}

/**
 * Check photoperiod status for soybean (short-day plant).
 * Returns alert when daylength is approaching or below critical threshold.
 */
export function getPhotoperiodStatus(
  daylength: number,
  criticalThreshold: number,
): PhotoperiodAlert | null {
  const diff = daylength - criticalThreshold;

  if (diff <= 0) {
    return {
      type: 'info',
      message: `Daylength (${daylength.toFixed(1)}h) is below critical threshold (${criticalThreshold}h). Flowering induction active.`,
      currentDaylength: daylength,
      criticalThreshold,
    };
  }

  if (diff <= 0.5) {
    return {
      type: 'warning',
      message: `Daylength (${daylength.toFixed(1)}h) approaching critical threshold (${criticalThreshold}h). Flowering induction expected soon.`,
      currentDaylength: daylength,
      criticalThreshold,
    };
  }

  return null;
}

/**
 * Calculate Photothermal Units (PTU = daily GDD × daylength).
 * Combines thermal and photoperiod effects — more predictive than GDD alone for soybean.
 */
export function calculatePtu(gddData: DailyGdd[], latitude: number): PtuDay[] {
  let cumPtu = 0;
  return gddData.map((day) => {
    const doy = getDayOfYear(day.date);
    const daylength = calculateDaylength(latitude, doy);
    const dailyPtu = day.gdd * daylength;
    cumPtu += dailyPtu;
    return {
      date: day.date,
      dailyPtu: Math.round(dailyPtu * 10) / 10,
      cumulativePtu: Math.round(cumPtu),
      daylength: Math.round(daylength * 100) / 100,
    };
  });
}
