"use client";

// Gedeelde polling-hooks voor kaartpagina's.
// Vóór deze module haalde elke pagina dezelfde endpoints zelf op met
// eigen (deels afwijkende) fetch-/foutafhandeling. Eén implementatie =
// geen onbehandelde rejecties, geen stale responses, nette cleanup bij
// unmount (AbortController).
import { useCallback, useEffect, useRef, useState } from "react";
import {
  parseGeofences,
  toMapLocations,
  type VehicleSourceRow,
} from "./map-data";
import type { MapZone, MapLocation } from "@/components/tracking-map";

type PollState<T> = {
  data: T | null;
  error: string | null;
  reload: () => void;
};

/** Voert periodiek (of eenmalig bij intervalMs=null) een fetcher uit.
 * Resultaten worden genegeerd als er nieuwere request loopt of bij unmount. */
function usePoll<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  intervalMs: number | null
): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  // Fetcher bijwerken via effect (refs mogen niet in render worden geschreven);
  // vóór de poll-effect gedeclareerd zodat die altijd de laatste versie ziet.
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    let active = true;
    let seq = 0;
    const controller = new AbortController();

    const run = async () => {
      const mySeq = ++seq;
      try {
        const result = await fetcherRef.current(controller.signal);
        // Alleen het nieuwste resultaat toepassen (trage request die later
        // terugkomt mag een nieuwe poll niet overschrijven).
        if (!active || mySeq !== seq) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (!active || mySeq !== seq || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Netwerkfout");
      }
    };

    void run();
    const timer = intervalMs ? setInterval(() => void run(), intervalMs) : null;
    return () => {
      active = false;
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [intervalMs, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, reload };
}

async function getJson(res: Response, what: string): Promise<unknown> {
  if (!res.ok) throw new Error(`${what} laden mislukt (${res.status})`);
  return res.json();
}

/** Live voertuigbronnen uit /api/ingest/sources (standaard elke 5s).
 * intervalMs = null → eenmalig laden (bijv. historie-pagina). */
export function useIngestSources(intervalMs: number | null = 5000) {
  const { data, error, reload } = usePoll<VehicleSourceRow[]>(
    async (signal) => {
      const res = await fetch("/api/ingest/sources", {
        cache: "no-store",
        signal,
      });
      const d = (await getJson(res, "Voertuigen")) as {
        sources?: VehicleSourceRow[];
      };
      return d.sources ?? [];
    },
    intervalMs
  );
  return { sources: data ?? [], error, reload };
}

/** Voertuiglijst uit /api/vehicles (dashboard; bevat personen/kenteken). */
export function useVehicleList(intervalMs: number | null = 10_000) {
  const { data, error, reload } = usePoll<VehicleSourceRow[]>(
    async (signal) => {
      const res = await fetch("/api/vehicles", { cache: "no-store", signal });
      const d = (await getJson(res, "Voertuigen")) as {
        vehicles?: VehicleSourceRow[];
      };
      return d.vehicles ?? [];
    },
    intervalMs
  );
  return { vehicles: data ?? [], error, reload };
}

export type MapLayers = {
  zones: MapZone[];
  locations: MapLocation[];
};

/** Kaartlagen: actieve geofences + beheerde locaties in één poll.
 * Bij fout in één van beide blijft de vorige laadstand staan + error. */
export function useMapLayers(intervalMs: number | null = 30_000) {
  const { data, error, reload } = usePoll<MapLayers>(async (signal) => {
    const [zRes, locRes] = await Promise.all([
      fetch("/api/geofences", { cache: "no-store", signal }),
      fetch("/api/locations?status=active", { cache: "no-store", signal }),
    ]);
    const [z, l] = await Promise.all([
      getJson(zRes, "Geofences") as Promise<{ geofences?: unknown }>,
      getJson(locRes, "Locaties") as Promise<{ locations?: unknown }>,
    ]);
    return {
      zones: parseGeofences(z.geofences),
      locations: toMapLocations(l.locations),
    };
  }, intervalMs);
  return {
    zones: data?.zones ?? [],
    locations: data?.locations ?? [],
    error,
    reload,
  };
}
