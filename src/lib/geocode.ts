// Server-side geocoding: Photon (primair, OSM, geen key) + Nominatim (fallback).
// Bewust server-side: centrale rate-limit, geen keys in de browser,
// vervangbare provider achter één interface.
// LET OP: publieke endpoints — matig gebruiken (1 req/sec per client is netjes).

export type GeocodeResult = {
  label: string;
  latitude: number;
  longitude: number;
  provider: "photon" | "nominatim";
  /** Extra adrescomponenten voor weergave */
  detail?: string;
};

const FETCH_TIMEOUT_MS = 8_000;
const MAX_RESULTS = 6;
/** Identificatie voor publieke providers (Nominatim vereist een geldige UA). */
const USER_AGENT = "GPSManager/1.0 (self-hosted fleet management; no public use)";
const HEADERS = {
  Accept: "application/json",
  "User-Agent": USER_AGENT,
};

function buildPhotonLabel(p: Record<string, unknown>): { label: string; detail: string } {
  const str = (v: unknown) => (typeof v === "string" && v ? v : "");
  const street = str(p.street);
  const housenumber = str(p.housenumber);
  const name = str(p.name);
  const road = street || name;
  const line1 = road && housenumber ? `${road} ${housenumber}` : road || name;
  const locality = [str(p.postcode), str(p.city) || str(p.town) || str(p.village)]
    .filter(Boolean)
    .join(" ");
  const country = str(p.country);
  const label = [line1, locality].filter(Boolean).join(", ") || "Onbekende locatie";
  return { label, detail: country };
}

async function fetchWithTimeout(url: string, signal?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  signal?.addEventListener("abort", () => ctrl.abort());
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: HEADERS,
    });
  } finally {
    clearTimeout(t);
  }
}

async function searchPhoton(q: string): Promise<GeocodeResult[]> {
  // LET OP: Photon ondersteunt geen lang=nl (400) — alleen default/de/en/fr/it
  const url = `https://photon.komoot.io/api/?limit=${MAX_RESULTS}&q=${encodeURIComponent(q)}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Photon HTTP ${res.status}`);
  const data = (await res.json()) as {
    features?: { geometry: { coordinates: [number, number] }; properties: Record<string, unknown> }[];
  };
  return (data.features ?? []).map((f) => {
    const { label, detail } = buildPhotonLabel(f.properties ?? {});
    return {
      label,
      detail,
      latitude: f.geometry.coordinates[1],
      longitude: f.geometry.coordinates[0],
      provider: "photon" as const,
    };
  });
}

async function searchNominatim(q: string): Promise<GeocodeResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${MAX_RESULTS}&accept-language=nl&q=${encodeURIComponent(q)}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const data = (await res.json()) as {
    display_name: string;
    lat: string;
    lon: string;
  }[];
  return data.map((r) => ({
    label: r.display_name.split(",").slice(0, 2).join(",").trim(),
    detail: r.display_name,
    latitude: Number(r.lat),
    longitude: Number(r.lon),
    provider: "nominatim" as const,
  }));
}

/**
 * Zoekt adressen/plaatsen. Photon eerst; bij fout of geen resultaten
 * Nominatim als fallback. Gooit alleen als beide falen.
 */
export async function geocode(query: string): Promise<{ results: GeocodeResult[]; provider: string }> {
  const q = query.trim();
  if (q.length < 3) return { results: [], provider: "none" };

  let photonError: string | null = null;
  try {
    const results = await searchPhoton(q);
    if (results.length > 0) return { results, provider: "photon" };
  } catch (err) {
    photonError = err instanceof Error ? err.message : String(err);
  }

  try {
    const results = await searchNominatim(q);
    if (results.length > 0) return { results, provider: "nominatim" };
    return { results: [], provider: photonError ? "none" : "photon" };
  } catch (err) {
    const nomError = err instanceof Error ? err.message : String(err);
    throw new Error(`Geocoding mislukt (photon: ${photonError ?? "geen resultaten"}; nominatim: ${nomError})`);
  }
}

// ─── Straatroute (OSRM demo-server, optioneel) ───
// Rechte lijn blijft de fallback; OSRM is een publieke demo — licht gebruiken.

export type RoadRoute = {
  distanceKm: number;
  durationMin: number;
  coordinates: [number, number][];
};

export async function fetchRoadRoute(
  points: [number, number][]
): Promise<RoadRoute | null> {
  if (points.length < 2) return null;
  const coords = points.map(([lat, lon]) => `${lon},${lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      code: string;
      routes?: {
        distance: number;
        duration: number;
        geometry: { coordinates: [number, number][] };
      }[];
    };
    if (data.code !== "Ok" || !data.routes?.[0]) return null;
    const r = data.routes[0];
    return {
      distanceKm: Math.round((r.distance / 1000) * 10) / 10,
      durationMin: Math.round(r.duration / 60),
      coordinates: r.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
    };
  } catch {
    return null;
  }
}
