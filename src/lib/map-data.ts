// Gedeelde data-shaping voor kaartpagina's.
// Vóór deze module kopieerde elke pagina dezelfde filter/map/logica
// (met kleine verschillen zoals een andere observedAt-fallback).
// Puur en side-effect-vrij — geen React, geen fetch.
import type { MapVehicle, MapZone, MapLocation } from "@/components/tracking-map";

/** Velden die zowel /api/ingest/sources als /api/vehicles leveren.
 * Endpoint-specifieke velden zijn optioneel. */
export type VehicleSourceRow = {
  id: string;
  name: string;
  displayName: string;
  iconEmoji: string;
  latitude: number | null;
  longitude: number | null;
  speedKmh: number | null;
  moving: boolean;
  status: string;
  sampledAt?: string | null;
  receivedAt?: string | null;
  // Aanwezig op /api/ingest/sources:
  lastSpeedKmh?: number | null;
  trackingState?: string;
  // Aanwezig op /api/vehicles:
  licensePlate?: string | null;
  brand?: string | null;
  vehicleType?: string | null;
  persons?: { id: string; name: string }[];
};

/** Bronnen → kaartmarkers (alleen voertuigen met een geldige positie). */
export function toMapVehicles(sources: VehicleSourceRow[]): MapVehicle[] {
  return sources
    .filter((s) => s.latitude != null && s.longitude != null)
    .map((s) => ({
      id: s.id,
      name: s.displayName,
      iconEmoji: s.iconEmoji,
      latitude: s.latitude as number,
      longitude: s.longitude as number,
      speedKmh: s.speedKmh,
      moving: s.moving,
      status: s.status,
      // Valt terug op receivedAt i.p.v. "nu": een nieuwe timestamp per render
      // zou elke poll een nieuwe marker-identiteit geven en de UI laten flikkeren.
      observedAt: s.sampledAt ?? s.receivedAt ?? new Date().toISOString(),
    }));
}

type GeofenceRow = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  /** JSON-string "[[lat,lon],…]" zoals de API die opslaat */
  coordinates: string;
  isActive: boolean;
};

/** Geofence-rijen → MapZone[]. Corrupte coordinates-string wordt per rij
 * overgeslagen (i.p.v. de hele lijst te laten falen met een onbehandelde
 * JSON.parse-fout). */
export function parseGeofences(raw: unknown): MapZone[] {
  if (!Array.isArray(raw)) return [];
  const zones: MapZone[] = [];
  for (const z of raw as GeofenceRow[]) {
    if (!z?.isActive || typeof z.coordinates !== "string") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(z.coordinates);
    } catch {
      continue; // corrupte rij negeren, rest van de zones blijft werken
    }
    if (!Array.isArray(parsed) || parsed.length < 3) continue;
    const coordinates = parsed.filter(
      (p): p is [number, number] =>
        Array.isArray(p) &&
        p.length === 2 &&
        typeof p[0] === "number" &&
        Number.isFinite(p[0]) &&
        typeof p[1] === "number" &&
        Number.isFinite(p[1])
    );
    if (coordinates.length < 3) continue;
    zones.push({
      id: z.id,
      name: z.name,
      description: z.description ?? null,
      color: z.color,
      coordinates,
    });
  }
  return zones;
}

type LocationRow = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  type: "permanent" | "temporary";
  color: string | null;
  isExpired: boolean;
  expiresAt: string | null;
  notes: string | null;
};

/** Locatie-rijen → MapLocation[] (identity mapping met validering). */
export function toMapLocations(raw: unknown): MapLocation[] {
  if (!Array.isArray(raw)) return [];
  return (raw as LocationRow[]).filter(
    (l) =>
      l &&
      typeof l.id === "string" &&
      typeof l.latitude === "number" &&
      Number.isFinite(l.latitude) &&
      typeof l.longitude === "number" &&
      Number.isFinite(l.longitude)
  );
}
