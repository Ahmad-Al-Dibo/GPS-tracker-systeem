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
    <div className="flex h-full items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 text-slate-500">
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
  lastSpeedKmh: number | null;
  trackingState: string;
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
      {/* Header met gradient — stapelt netjes op mobiel */}
      <div className="flex flex-col gap-3 border-b border-blue-100 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h1 className="text-lg font-bold text-white drop-shadow-sm sm:text-xl">Live Kaart</h1>
          <p className="text-xs text-blue-100 sm:text-sm">
            {sources.length} voertuigen · {sources.filter((s) => s.moving).length} bewegend
          </p>
        </div>
        <div className="flex flex-row flex-wrap items-center gap-2">
          <button
            onClick={() => (sharing ? stopShare() : void startShare())}
            className={`flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold shadow-sm transition sm:flex-none ${
              sharing
                ? "bg-red-500 text-white hover:bg-red-600"
                : "bg-white text-blue-700 hover:bg-blue-50"
            }`}
          >
            {sharing ? "■ Stop delen" : "◎ Deel mijn locatie"}
          </button>
          {shareStatus && (
            <p className="w-full rounded-lg bg-white/15 px-2.5 py-1.5 text-xs text-white backdrop-blur-sm sm:w-auto">{shareStatus}</p>
          )}
        </div>
      </div>

      {/* Mobiel: kaart eerst (vaste hoogte), lijst eronder. Desktop: lijst links, kaart rechts. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_1fr]">
        {/* Voertuigenlijst — licht thema, begrensde hoogte op mobiel */}
        <aside className="max-h-[38vh] overflow-y-auto border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white p-3 order-2 lg:order-1 lg:max-h-none lg:border-b-0 lg:border-r">
          <ul className="flex flex-col gap-2">
            {sources.map((s) => (
              <li
                key={s.id}
                className={`cursor-pointer overflow-hidden rounded-xl border bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                  selectedId === s.id
                    ? "border-blue-400 ring-2 ring-blue-100"
                    : "border-slate-200 hover:border-blue-200"
                }`}
                onClick={() => void selectSource(s.id)}
              >
                <div
                  className="h-1"
                  style={{
                    background:
                      s.status === "fresh"
                        ? "linear-gradient(90deg, #16a34a, #4ade80)"
                        : s.status === "stale"
                          ? "linear-gradient(90deg, #d97706, #fbbf24)"
                          : "linear-gradient(90deg, #cbd5e1, #e2e8f0)",
                  }}
                />
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-gradient-to-br from-blue-50 to-indigo-100 text-lg">
                        {s.iconEmoji}
                      </span>
                      <span className="truncate font-medium text-slate-800">{s.displayName}</span>
                    </div>
                    <span
                      className={`flex-none rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.status === "fresh"
                          ? "bg-emerald-100 text-emerald-700"
                          : s.status === "stale"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {s.status === "fresh" ? "Online" : s.status === "stale" ? "Verouderd" : "Offline"}
                    </span>
                  </div>
                  {s.speedKmh != null ? (
                    <p className="mt-1.5 text-xs text-slate-500">
                      {s.moving ? "▸" : "▪"} {s.speedKmh} km/u
                    </p>
                  ) : s.lastSpeedKmh != null ? (
                    <p className="mt-1.5 text-xs text-slate-400">
                      laatst bekend: {s.lastSpeedKmh} km/u
                    </p>
                  ) : null}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFollowId((p) => (p === s.id ? null : s.id));
                    }}
                    className={`mt-2 w-full rounded-lg px-2.5 py-2 text-xs font-semibold transition ${
                      followId === s.id
                        ? "bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-sm"
                        : "border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                    }`}
                  >
                    {followId === s.id ? "◉ Volgt" : "○ Volgen"}
                  </button>
                </div>
              </li>
            ))}
            {sources.length === 0 && (
              <li className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-6 text-center text-sm text-slate-400">
                Geen voertuigen met positie.
              </li>
            )}
          </ul>
        </aside>

        {/* Kaart — gegarandeerde hoogte op mobiel, vult desktop */}
        <section className="relative order-1 h-[55vh] min-h-[320px] lg:order-2 lg:h-auto lg:min-h-0">
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
            onSaveAsLocation={onSaveSelection}
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
