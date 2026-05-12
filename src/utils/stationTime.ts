/**
 * Station local time helpers.
 *
 * The Ambient Weather WS-2902C reports `dateutc` as a UTC epoch (ms).
 * All daily grouping (GDD, ETo, rain) must use the station's local date
 * so that data aligns correctly — especially rain, which resets at
 * midnight local time.
 *
 * Station: Agraria Uruguay — UTC-3, no DST.
 */

/** Station timezone offset from UTC in hours */
const STATION_TZ_OFFSET_HOURS = -3;

const OFFSET_MS = STATION_TZ_OFFSET_HOURS * 3_600_000;

/**
 * Convert a UTC timestamp (ms) to the station's local date string (YYYY-MM-DD).
 */
export function getStationLocalDate(dateutcMs: number): string {
  return new Date(dateutcMs + OFFSET_MS).toISOString().split('T')[0];
}

/**
 * Get the station-local hour (0-23) from a UTC timestamp (ms).
 */
export function getStationLocalHour(dateutcMs: number): number {
  return new Date(dateutcMs + OFFSET_MS).getUTCHours();
}
