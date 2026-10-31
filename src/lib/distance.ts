// Afstand- en snelheidsberekening voor GPS-punten
// Haversine-formule voor afstand tussen twee coördinaten

const EARTH_RADIUS_M = 6_371_000;

/** Bereken afstand in meters tussen twee GPS-punten (Haversine). */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Minimale afstand (meters) om als "beweging" te tellen. */
export const MIN_MOVEMENT_M = 5;
/** Maximale afstand (meters) tussen opeenvolgende punten om als "dezelfde rit" te beschouwen. */
export const MAX_GAP_M = 500;
/** Maximale tijd (seconden) tussen punten om als "dezelfde rit" te beschouwen. */
export const MAX_TIME_GAP_S = 300;

/**
 * Berekent de afgelegde afstand sinds het laatste bewaarde punt.
 * Houdt rekening met stilstaande voertuigen (MIN_MOVEMENT_M) en grote sprongen.
 */
export function calculateDistanceDelta(
  prevLat: number | null,
  prevLon: number | null,
  prevAt: Date | null,
  newLat: number,
  newLon: number,
  newAt: Date
): { distanceM: number; isMoving: boolean } {
  // Geen vorige punt — geen afstand
  if (prevLat == null || prevLon == null || prevAt == null) {
    return { distanceM: 0, isMoving: false };
  }

  const distanceM = haversineDistance(prevLat, prevLon, newLat, newLon);
  const timeGapS = (newAt.getTime() - prevAt.getTime()) / 1000;

  // Grote sprong in tijd of afstand — niet als doorlopende rit rekenen
  if (timeGapS > MAX_TIME_GAP_S || distanceM > MAX_GAP_M) {
    return { distanceM: 0, isMoving: distanceM >= MIN_MOVEMENT_M };
  }

  // Te weinig beweging — stilstand
  if (distanceM < MIN_MOVEMENT_M) {
    return { distanceM: 0, isMoving: false };
  }

  return { distanceM, isMoving: true };
}

/**
 * Berekent snelheid in m/s uit twee punten.
 * Als de tracker zelf snelheid levert, heeft die voorrang.
 */
export function calculateSpeed(
  distanceM: number,
  timeGapS: number,
  reportedSpeedMps: number | null
): number | null {
  // Gerapporteerde snelheid heeft voorrang
  if (reportedSpeedMps != null && reportedSpeedMps >= 0) {
    return reportedSpeedMps;
  }
  // Bereken uit afstand en tijd
  if (timeGapS > 0 && distanceM >= 0) {
    return distanceM / timeGapS;
  }
  return null;
}
