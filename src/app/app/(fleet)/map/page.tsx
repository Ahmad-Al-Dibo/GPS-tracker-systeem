"use client";

// Live Kaart-pagina — met browser-locatie delen, geofences, locaties en filters
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MapFilterControl from "@/components/map-filters";
import { useMapFilters, applyLocationFilters } from "@/lib/map-filters";
import type { MapZone, MapLocation, SelectionMarker } from "@/components/tracking-map";

const TrackingMap = dynamic(() => import("@/components/tracking-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-slate-900 text-slate-400">
      Kaart laden…
    </div>
  ),
});

type Source = {
  id: string;
  name: string;
  displayName: string;
  iconEmoji: string;
  latitude: number | null;
  longitude: number | null;
  speedKmh: number | null;
  moving: boolean;
  status: string;
  sampledAt: string | null;
  receivedAt: string;
};

export default function LiveMapPage() {
  const router = useRouter();
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [followId, setFollowId] = useState<string | null>(null);
  const [trail, setTrail] = useState<[number, number][] | null>(null);
  const [zones, setZones] = useState<MapZone[]>([]);
  const [rawLocations, setRawLocations] = useState<MapLocation[]>([]);

  // Kaartfilters (pagina-scoped; standaard geen verlopen locaties)
  const { state: filterState, visible, toggle } = useMapFilters(
    { locationsExpired: false },
    {
      vehicles: true,
      zones: true,
      locationsPermanent: true,
      locationsTemporary: true,
      locationsExpired: true,
    }
  );

  // ── Browser-locatie delen ──
  const [username, setUsername] = useState("gebruiker");
  const [sharing, setSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const watchIdRef = useRef<number | null>(null);
  const shareKeyRef = useRef<string | null>(null);

  useEffect(() => {
    void fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.username) setUsername(d.username);
      })
      .catch(() => undefined);
  }, []);

  // Zorg dat er een API-key is voor het delen (eenmalig aanmaken, in browser bewaard)
  const ensureShareKey = useCallback(async (): Promise<string> => {
    if (shareKeyRef.current) return shareKeyRef.current;
    const stored = typeof window !== "undefined"
      ? localStorage.getItem("gps_browser_share_key")
      : null;
    if (stored) {
      shareKeyRef.current = stored;
      return stored;
    }
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Browser-locatie (kaart)" }),
    });
    const d = await res.json().catch(() => null);
    if (!res.ok || !d?.apiKey) {
      throw new Error(d?.error ?? `Fout ${res.status} bij key aanmaken`);
    }
    localStorage.setItem("gps_browser_share_key", d.apiKey);
    shareKeyRef.current = d.apiKey as string;
    return d.apiKey as string;
  }, []);

  const startShare = useCallback(async () => {
    if (!navigator.geolocation) {
      setShareStatus("Browser ondersteunt locatie niet");
      return;
    }
    let key: string;
    try {
      key = await ensureShareKey();
    } catch (err) {
      setShareStatus(err instanceof Error ? err.message : "Key aanmaken mislukt");
      return;
    }
    setSharing(true);
    setShareStatus("Wachten op GPS…");

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (p) => {
        const body = JSON.stringify({
          name: `browser-${username}`,
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracyMeters: p.coords.accuracy ?? null,
          speedMps: p.coords.speed ?? null,
          sampledAt: p.timestamp,
        });
        try {
          const res = await fetch("/api/ingest", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-API-Key": key },
            body,
          });
          setShareStatus(
            res.ok
              ? `Deelt locatie — laatst ${new Date().toLocaleTimeString("nl-NL")}`
              : `Versturen mislukt (${res.status})`
          );
        } catch {
          setShareStatus("Netwerkfout bij versturen");
        }
      },
      (err) => {
        setShareStatus(`GPS-fout: ${err.message} — sta locatietoegang toe`);
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 }
    );
  }, [ensureShareKey, username]);

  const stopShare = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setSharing(false);
    setShareStatus("Delen gestopt");
  }, []);

  // Opruimen bij verlaten pagina
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/ingest/sources", { cache: "no-store" });
    if (res.ok) {
      const d = await res.json();
      setSources(d.sources);
    }
  }, []);

  const loadLayers = useCallback(async () => {
    const [zRes, locRes] = await Promise.all([
      fetch("/api/geofences"),
      fetch("/api/locations?status=active"),
    ]);
    if (zRes.ok) {
      const d = await zRes.json();
      setZones(
        d.geofences
          .filter((z: { isActive: boolean }) => z.isActive)
          .map(
            (z: {
              id: string;
              name: string;
              description: string | null;
              color: string;
              coordinates: string;
            }) => ({
              id: z.id,
              name: z.name,
              description: z.description,
              color: z.color,
              coordinates: JSON.parse(z.coordinates) as [number, number][],
            })
          )
          .filter((z: MapZone) => Array.isArray(z.coordinates) && z.coordinates.length >= 3)
      );
    }
    if (locRes.ok) {
      const d = await locRes.json();
      setRawLocations(
        d.locations.map(
          (l: {
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
          }) => ({
            id: l.id,
            name: l.name,
            address: l.address,
            latitude: l.latitude,
            longitude: l.longitude,
            type: l.type,
            color: l.color,
            isExpired: l.isExpired,
            expiresAt: l.expiresAt,
            notes: l.notes,
          })
        )
      );
    }
  }, []);

  useEffect(() => {
    void load();
    void loadLayers();
    const t = setInterval(() => void load(), 5000);
    const t2 = setInterval(() => void loadLayers(), 30_000);
    return () => {
      clearInterval(t);
      clearInterval(t2);
    };
  }, [load, loadLayers]);

  const visibleLocations = useMemo(
    () => applyLocationFilters(rawLocations, visible),
    [rawLocations, visible]
  );

  /** Kaartselectie opslaan → open Locaties-module met vooraf ingevulde selectie. */
  const onSaveSelection = useCallback(
    (sel: SelectionMarker) => {
      const params = new URLSearchParams({
        selLat: String(sel.pos[0]),
        selLon: String(sel.pos[1]),
        selLabel: sel.label,
      });
      router.push(`/app/locations?${params}`);
    },
    [router]
  );

  const selectSource = useCallback(
    async (id: string) => {
      setSelectedId(id);
      const src = sources.find((s) => s.id === id);
      if (!src) return;
      try {
        const res = await fetch(
          `/api/ingest/sources/${encodeURIComponent(src.name)}?limit=200`
        );
        if (res.ok) {
          const d = await res.json();
          setTrail(
            d.trail.map((p: { latitude: number; longitude: number }) => [
              p.latitude,
              p.longitude,
            ])
          );
        }
      } catch {
        setTrail(null);
      }
    },
    [sources]
  );

  const mapVehicles = sources
    .filter((s) => s.latitude != null && s.longitude != null)
    .map((s) => ({
      id: s.id,
      name: s.displayName,
      iconEmoji: s.iconEmoji,
      latitude: s.latitude!,
      longitude: s.longitude!,
      speedKmh: s.speedKmh,
      moving: s.moving,
      status: s.status,
      observedAt: s.sampledAt ?? s.receivedAt,
    }));

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 border-b border-slate-800 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Live Kaart</h1>
          <p className="text-sm text-slate-400">
            {sources.length} voertuigen · {sources.filter((s) => s.moving).length} bewegend
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <button
            onClick={() => (sharing ? stopShare() : void startShare())}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              sharing
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
          >
            {sharing ? "■ Stop delen" : "📡 Deel mijn locatie"}
          </button>
          {shareStatus && (
            <p className="text-xs text-slate-400">{shareStatus}</p>
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_1fr]">
        <aside className="overflow-y-auto border-r border-slate-800 p-3">
          <ul className="flex flex-col gap-2">
            {sources.map((s) => (
              <li
                key={s.id}
                className={`cursor-pointer rounded-xl border p-3 text-sm ${
                  selectedId === s.id
                    ? "border-sky-600 bg-sky-950/40"
                    : "border-slate-800 bg-slate-900/60 hover:border-slate-600"
                }`}
                onClick={() => void selectSource(s.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>{s.iconEmoji}</span>
                    <span className="font-medium">{s.displayName}</span>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      s.status === "fresh"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : s.status === "stale"
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-slate-500/20 text-slate-300"
                    }`}
                  >
                    {s.status}
                  </span>
                </div>
                {s.speedKmh != null && (
                  <p className="mt-1 text-xs text-slate-400">
                    {s.moving ? "▶" : "⏸"} {s.speedKmh} km/u
                  </p>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFollowId((p) => (p === s.id ? null : s.id));
                  }}
                  className={`mt-2 rounded-lg px-2 py-1 text-xs ${
                    followId === s.id
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-800 hover:bg-slate-700"
                  }`}
                >
                  {followId === s.id ? "◉ Volgt" : "○ Volgen"}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="relative min-h-0">
          <TrackingMap
            vehicles={visible.vehicles ? mapVehicles : []}
            zones={visible.zones ? zones : []}
            locations={visibleLocations}
            selectedId={selectedId}
            followId={followId}
            trail={trail ?? undefined}
            onSelect={(id) => void selectSource(id)}
            onMapClick={() => setFollowId(null)}
            onSaveSelection={onSaveSelection}
            showLegend
          />
          <MapFilterControl
            state={filterState}
            available={{
              vehicles: true,
              zones: true,
              locationsPermanent: true,
              locationsTemporary: true,
              locationsExpired: true,
            }}
            onToggle={toggle}
          />
        </section>
      </div>
    </div>
  );
}
