"use client";

// Moderne kaart: OSM-tiles, emoji-markers, trails, volgmodus, full-screen,
// plaatszoeker (Photon/OSM via server-proxy), "mijn locatie" (browser-GPS),
// geofence-polygonen, beheerde locaties en routevisualisatie.
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  Polygon,
  Circle,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";

export type MapVehicle = {
  id: string;
  name: string;
  iconEmoji: string;
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  moving: boolean;
  status: string;
  observedAt: string;
};

export type MapZone = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  /** [[lat,lon],…] */
  coordinates: [number, number][];
};

export type MapLocation = {
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

export type RouteLinePoint = {
  pos: [number, number];
  kind: "start" | "mid" | "end";
  name: string;
  order: number;
};

export type RouteVisualization = {
  points: RouteLinePoint[];
  /** OSRM-straatroute (beschikbaar) of null → rechte lijn als fallback */
  roadRoute: [number, number][] | null;
  roadRouteInfo: { distanceKm: number; durationMin: number } | null;
};

export type SelectionMarker = {
  pos: [number, number];
  label: string;
};

/** Tilesoort: osm = gratis standaard; carto = donker (optioneel) */
export type TileStyle = "osm" | "carto";

type Props = {
  vehicles: MapVehicle[];
  selectedId?: string | null;
  followId?: string | null;
  trail?: [number, number][];
  onSelect?: (id: string) => void;
  onMapClick?: () => void;
  showNames?: boolean;
  showSpeed?: boolean;
  tileStyle?: TileStyle;
  /** Geofence-polygonen (pagina laadt + filtert zelf) */
  zones?: MapZone[];
  /** Beheerde locaties */
  locations?: MapLocation[];
  /** Route die gevisualiseerd wordt */
  routeLine?: RouteVisualization | null;
  /** Selectie-actie uit de zoekbalk ("Opslaan als locatie") */
  onSaveSelection?: (sel: SelectionMarker) => void;
  /** Rechtermuisknop → "Opslaan als locatie" */
  onSaveAsLocation?: (sel: SelectionMarker) => void;
  /** Legenda tonen */
  showLegend?: boolean;
  /** Extra legenda-items (door pagina aangeleverd) */
  legendExtra?: { color: string; label: string }[];
};

/** Emoji-marker; optioneel naam + snelheid als label */
function vehicleIcon(
  emoji: string,
  label: string,
  moving: boolean,
  selected: boolean,
  showNames: boolean,
  showSpeed: boolean,
  speedKmh: number | null
): L.DivIcon {
  const border = selected ? "#38bdf8" : moving ? "#4ade80" : "#94a3b8";
  const size = selected ? 48 : 40;
  let labelText = "";
  if (showNames) labelText = label;
  if (showSpeed && speedKmh != null) {
    labelText = labelText ? `${labelText} · ${speedKmh} km/u` : `${speedKmh} km/u`;
  }
  const labelHtml = labelText
    ? `<div class="va-label">${escapeHtml(labelText)}</div>`
    : "";
  return L.divIcon({
    className: "va-marker",
    html: `<div class="va-pin" style="--va-border:${border};width:${size}px;height:${size}px">
        <span>${emoji}</span>
      </div>${labelHtml}`,
    iconSize: [size, size + 22],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Gekleurd cirkel-marker voor beheerde locaties */
function locationIcon(loc: MapLocation): L.DivIcon {
  const color = loc.color ?? (loc.type === "temporary" ? "#f97316" : "#2563eb");
  const ring = loc.isExpired ? "#94a3b8" : color;
  const inner = loc.isExpired ? "#cbd5e1" : color;
  const label = escapeHtml(loc.name);
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">
      <div style="width:14px;height:14px;border-radius:50%;background:${inner};border:3px solid #fff;box-shadow:0 0 0 2px ${ring},0 2px 5px rgba(0,0,0,.35)"></div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:1px 6px;font-size:11px;font-weight:600;color:#0f172a;white-space:nowrap">${label}</div>
    </div>`,
    iconSize: [14, 34],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  });
}

/** Genummerd routepunt-marker */
function routePointIcon(kind: "start" | "mid" | "end", order: number): L.DivIcon {
  const bg = kind === "start" ? "#16a34a" : kind === "end" ? "#dc2626" : "#2563eb";
  return L.divIcon({
    className: "",
    html: `<div style="width:24px;height:24px;border-radius:50%;background:${bg};color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">${order}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
}

/** Centreren op geselecteerd voertuig; volgen bij update */
function MapController({
  vehicles,
  selectedId,
  followId,
}: Pick<Props, "vehicles" | "selectedId" | "followId">) {
  const map = useMap();
  const followingRef = useRef(false);

  useEffect(() => {
    if (!selectedId) {
      followingRef.current = false;
      return;
    }
    const v = vehicles.find((x) => x.id === selectedId);
    if (!v) return;
    map.flyTo([v.latitude, v.longitude], Math.min(Math.max(map.getZoom(), 14), 18), {
      duration: 0.7,
    });
    followingRef.current = followId === selectedId;
  }, [selectedId, map]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!followId) {
      followingRef.current = false;
      return;
    }
    const v = vehicles.find((x) => x.id === followId);
    if (!v) return;
    followingRef.current = true;
    map.panTo([v.latitude, v.longitude], { animate: true, duration: 0.5 });
  }, [followId, vehicles, map]);

  return null;
}

function ClickHandler({ onMapClick }: { onMapClick?: () => void }) {
  useMapEvents({
    click() {
      onMapClick?.();
    },
  });
  return null;
}

// ─── Rechtermuisknop-contextmenu op de kaart ───

type ContextMenuState = {
  pos: [number, number]; // screen-coördinaten
  latLng: [number, number]; // geo-coördinaten
} | null;

function ContextMenuHandler({
  onSaveAsLocation,
}: {
  onSaveAsLocation?: (sel: SelectionMarker) => void;
}) {
  const map = useMap();
  const [menu, setMenu] = useState<ContextMenuState>(null);

  useEffect(() => {
    const onContextMenu = (e: L.LeafletMouseEvent) => {
      L.DomEvent.stop(e.originalEvent);
      setMenu({
        pos: [e.containerPoint.x, e.containerPoint.y],
        latLng: [e.latlng.lat, e.latlng.lng],
      });
    };
    const onLeftClick = () => setMenu(null);
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    map.on("contextmenu", onContextMenu);
    map.on("click", onLeftClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      map.off("contextmenu", onContextMenu);
      map.off("click", onLeftClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, [map]);

  if (!menu) return null;

  const [lat, lon] = menu.latLng;

  const handleSave = () => {
    const label = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    onSaveAsLocation?.({ pos: menu.latLng, label });
    setMenu(null);
  };

  const handleCopy = () => {
    navigator.clipboard?.writeText(`${lat.toFixed(6)}, ${lon.toFixed(6)}`).catch(() => {});
    setMenu(null);
  };

  const handleSearchHere = () => {
    map.flyTo(menu.latLng, 15, { duration: 0.6 });
    setMenu(null);
  };

  return (
    <div
      className="absolute z-[50] min-w-[200px] rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
      style={{
        left: Math.min(menu.pos[0], map.getContainer().clientWidth - 210),
        top: Math.min(menu.pos[1], map.getContainer().clientHeight - 160),
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="border-b border-slate-100 px-3 py-1.5 text-[11px] text-slate-400">
        {lat.toFixed(5)}, {lon.toFixed(5)}
      </div>
      <button
        onClick={handleSave}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50"
      >
        💾 <span className="font-medium">Opslaan als locatie</span>
      </button>
      <button
        onClick={handleSearchHere}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50"
      >
        🔍 <span>Zoom hier naartoe</span>
      </button>
      <button
        onClick={handleCopy}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50"
      >
        📋 <span>Coördinaten kopiëren</span>
      </button>
    </div>
  );
}

// ─── Plaatszoeker (server-proxy /api/geocode — Photon/Nominatim) ───
// Betrouwbaarheid: Enter zoekt direct (ook zonder resultaten), sequentie-
// guard tegen stale responses, toetsenbordbediening, Escape sluit.

type GeoResult = {
  id: number;
  pos: [number, number];
  label: string;
  detail: string | null;
  provider: string;
};

function SearchControl({
  onSaveSelection,
}: {
  onSaveSelection?: (sel: SelectionMarker) => void;
}) {
  const map = useMap();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [marker, setMarker] = useState<SelectionMarker | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 3) {
        setResults([]);
        setOpen(false);
        return;
      }
      const seq = ++seqRef.current;
      setSearching(true);
      setError(null);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`);
        const data = await res.json().catch(() => null);
        if (seq !== seqRef.current) return;
        if (!res.ok) {
          setError(data?.error ?? `Zoeken mislukt (${res.status})`);
          setResults([]);
          setOpen(false);
          return;
        }
        const list: GeoResult[] = (data.results ?? []).map(
          (
            r: { label: string; latitude: number; longitude: number; provider: string; detail?: string },
            i: number
          ) => ({
            id: i,
            pos: [r.latitude, r.longitude],
            label: r.label,
            detail: r.detail ?? null,
            provider: r.provider,
          })
        );
        setResults(list);
        setOpen(list.length > 0);
        setHighlight(list.length > 0 ? 0 : -1);
        if (list.length === 0) setError("Geen resultaten gevonden.");
      } catch {
        if (seq !== seqRef.current) return;
        setError("Netwerkfout bij zoeken");
      } finally {
        if (seq === seqRef.current) setSearching(false);
      }
    },
    []
  );

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setOpen(false);
      setError(null);
      return;
    }
    const coordMatch = q.match(
      /^(-?\d{1,3}(?:[.,]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.,]\d+)?)$/
    );
    if (coordMatch) {
      setResults([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(() => void runSearch(q), 450);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, runSearch]);

  const navigateTo = useCallback(
    (pos: [number, number], label: string) => {
      map.flyTo(pos, 16, { duration: 0.8 });
      setMarker({ pos, label });
      setOpen(false);
      setHighlight(-1);
    },
    [map]
  );

  const submit = useCallback(async () => {
    const q = query.trim();
    const coordMatch = q.match(
      /^(-?\d{1,3}(?:[.,]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.,]\d+)?)$/
    );
    if (coordMatch) {
      const lat = Number(coordMatch[1].replace(",", "."));
      const lon = Number(coordMatch[2].replace(",", "."));
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        navigateTo([lat, lon], `${lat.toFixed(5)}, ${lon.toFixed(5)}`);
        return;
      }
    }
    if (results.length > 0) {
      const pick = highlight >= 0 ? results[highlight] : results[0];
      navigateTo(pick.pos, pick.label);
      return;
    }
    const seq = ++seqRef.current;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const data = await res.json().catch(() => null);
      if (seq !== seqRef.current) return;
      if (!res.ok) {
        setError(data?.error ?? `Zoeken mislukt (${res.status})`);
        return;
      }
      const list: GeoResult[] = (data.results ?? []).map(
        (
          r: { label: string; latitude: number; longitude: number; provider: string; detail?: string },
          i: number
        ) => ({
          id: i,
          pos: [r.latitude, r.longitude],
          label: r.label,
          detail: r.detail ?? null,
          provider: r.provider,
        })
      );
      setResults(list);
      if (list.length > 0) {
        navigateTo(list[0].pos, list[0].label);
      } else {
        setError("Geen resultaten gevonden.");
        setOpen(false);
      }
    } catch {
      if (seq === seqRef.current) setError("Netwerkfout bij zoeken");
    } finally {
      if (seq === seqRef.current) setSearching(false);
    }
  }, [query, results, highlight, navigateTo]);

  const pinIcon = L.divIcon({
    className: "",
    html: `<div style="font-size:28px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.45))">📌</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });

  return (
    <>
      <div className="absolute left-3 top-3 z-[10] w-[calc(100%-5.25rem)] max-w-[360px]">
        <div className="relative">
          <div className="flex gap-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => results.length > 0 && setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                } else if (e.key === "ArrowDown" && results.length > 0) {
                  e.preventDefault();
                  setOpen(true);
                  setHighlight((h) => (h + 1) % results.length);
                } else if (e.key === "ArrowUp" && results.length > 0) {
                  e.preventDefault();
                  setHighlight((h) => (h <= 0 ? results.length - 1 : h - 1));
                } else if (e.key === "Escape") {
                  setOpen(false);
                  setHighlight(-1);
                }
              }}
              placeholder="Zoek plaats, straat of postcode… (Enter)"
              aria-label="Plaats zoeken"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900  shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-100"
            />
            <button
              onClick={() => void submit()}
              disabled={searching}
              className="shrink-0 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              title="Zoek"
            >
              🔍
            </button>
          </div>

          {error && (
            <div className="mt-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-600">
              {error}
            </div>
          )}

          {open && results.length > 0 && (
            <ul
              role="listbox"
              className="absolute mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
            >
              {results.map((r, i) => (
                <li key={r.id} role="option" aria-selected={i === highlight}>
                  <button
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => navigateTo(r.pos, r.label)}
                    className={`w-full px-3 py-2 text-left text-sm ${
                      i === highlight ? "bg-blue-50 text-blue-900" : "text-slate-700"
                    }`}
                  >
                    <span className="block font-medium">🔍 {r.label}</span>
                    {r.detail && r.detail !== r.label && (
                      <span className="block truncate text-xs text-slate-400">{r.detail}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {marker && (
        <Marker position={marker.pos} icon={pinIcon}>
          <Popup>
            <div style={{ minWidth: 200 }}>
              <strong style={{ fontSize: 13 }}>{marker.label}</strong>
              <br />
              <span style={{ fontSize: 12, color: "#64748b" }}>
                {marker.pos[0].toFixed(5)}, {marker.pos[1].toFixed(5)}
              </span>
              <br />
              <span style={{ fontSize: 11, color: "#94a3b8" }}>Tijdelijke selectie</span>
              <br />
              <button
                data-save-location="1"
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onSaveSelection?.(marker);
                }}
                style={{
                  marginTop: 6,
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                💾 Opslaan als locatie
              </button>
            </div>
          </Popup>
        </Marker>
      )}
    </>
  );
}

// ─── "Mijn locatie"-knop (browser-GPS) ───

function LocateButton() {
  const map = useMap();
  const [pos, setPos] = useState<{ pos: [number, number]; accuracy: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      alert("Locatiebepaling wordt niet ondersteund door deze browser.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const ll: [number, number] = [p.coords.latitude, p.coords.longitude];
        setPos({ pos: ll, accuracy: p.coords.accuracy ?? 0 });
        map.flyTo(ll, 16, { duration: 0.8 });
        setBusy(false);
      },
      (err) => {
        setBusy(false);
        alert(
          `Locatie niet beschikbaar: ${err.message}. Sta locatietoegang toe in je browser.`
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30_000 }
    );
  }, [map]);

  const dotIcon = L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 2px rgba(59,130,246,.5),0 2px 6px rgba(0,0,0,.35)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

  return (
    <>
      <button
        onClick={locate}
        disabled={busy}
        title="Ga naar mijn locatie (browser-GPS)"
        className="absolute right-3 top-3 z-[10] flex h-9 w-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 sm:w-auto sm:px-3"
      >
        ◎<span className="hidden sm:inline">{busy ? "Bepalen…" : "Mijn locatie"}</span>
      </button>

      {pos && (
        <>
          <Circle
            center={pos.pos}
            radius={Math.max(pos.accuracy, 10)}
            pathOptions={{
              color: "#3b82f6",
              fillColor: "#3b82f6",
              fillOpacity: 0.08,
              weight: 1,
              dashArray: "4 4",
            }}
          />
          <Marker position={pos.pos} icon={dotIcon}>
            <Popup>
              <strong>Mijn huidige locatie</strong>
              <br />
              <span style={{ fontSize: 12 }}>
                {pos.pos[0].toFixed(5)}, {pos.pos[1].toFixed(5)}
                <br />
                Nauwkeurigheid ≈ {Math.round(pos.accuracy)} m
              </span>
            </Popup>
          </Marker>
        </>
      )}
    </>
  );
}

// ─── Legenda ───

function MapLegend({
  extra,
  hasVehicles,
  hasZones,
  hasLocations,
  hasRoute,
}: {
  extra: { color: string; label: string }[];
  hasVehicles: boolean;
  hasZones: boolean;
  hasLocations: boolean;
  hasRoute: boolean;
}) {
  const items: { color: string; label: string; icon?: string }[] = [];
  if (hasVehicles) items.push({ color: "#4ade80", label: "Voertuig (bewegend)", icon: "🚚" });
  if (hasZones) items.push({ color: "#8b5cf6", label: "Geofence-zone", icon: "⬡" });
  if (hasLocations) {
    items.push({ color: "#2563eb", label: "Locatie (permanent)" });
    items.push({ color: "#f97316", label: "Locatie (tijdelijk)" });
    items.push({ color: "#94a3b8", label: "Locatie (verlopen)" });
  }
  if (hasRoute) items.push({ color: "#2563eb", label: "Routepunt (genummerd)", icon: "1️⃣" });
  items.push(...extra);
  if (items.length === 0) return null;

  return (
    <div className="absolute bottom-3 left-3 z-[10] max-w-[46vw] rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-[10px] shadow-sm backdrop-blur sm:max-w-none sm:px-3 sm:py-2 sm:text-xs">
      <p className="mb-1 font-semibold text-slate-700">Legenda</p>
      <ul className="flex flex-col gap-0.5 sm:gap-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1.5 text-slate-600">
            {it.icon ? (
              <span>{it.icon}</span>
            ) : (
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: it.color }}
              />
            )}
            {it.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Hoofdcomponent ───

export default function TrackingMap({
  vehicles,
  selectedId,
  followId,
  trail,
  onSelect,
  onMapClick,
  showNames = true,
  showSpeed = true,
  tileStyle = "osm",
  zones = [],
  locations = [],
  routeLine = null,
  onSaveSelection,
  onSaveAsLocation,
  showLegend = false,
  legendExtra = [],
}: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = useCallback(() => {
    if (!isFullscreen && containerRef.current) {
      containerRef.current.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) setIsFullscreen(false);
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const center = useMemo<[number, number]>(() => {
    const sel = vehicles.find((v) => v.id === selectedId);
    if (sel) return [sel.latitude, sel.longitude];
    if (vehicles[0]) return [vehicles[0].latitude, vehicles[0].longitude];
    if (locations[0]) return [locations[0].latitude, locations[0].longitude];
    return [52.1, 6.1];
  }, [vehicles, selectedId, locations]);

  const trailPath = useMemo<[number, number][]>(
    () => (trail ?? []).map((p) => [p[0], p[1]] as [number, number]),
    [trail]
  );

  const tileProps =
    tileStyle === "carto"
      ? {
          url: `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${process.env.NEXT_PUBLIC_CARTO_KEY ?? ""}`,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
          maxZoom: 18 as const,
          subdomains: "abcd",
        }
      : tileStyle === "osm"
        ? {
            url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 18 as const,
            subdomains: undefined,
          }
        : {
            url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
            maxZoom: 18 as const,
            subdomains: "abcd",
          };

  const routePositions = useMemo<[number, number][]>(() => {
    if (!routeLine) return [];
    if (routeLine.roadRoute && routeLine.roadRoute.length > 1) return routeLine.roadRoute;
    return routeLine.points.map((p) => p.pos);
  }, [routeLine]);

  return (
    <div
      ref={containerRef}
      className={`tracking-map relative ${isFullscreen ? "fixed inset-0 z-[200] h-screen w-screen" : "h-full w-full"}`}
    >
      <button
        onClick={toggleFullscreen}
        className="absolute right-3 top-3 z-[10] flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm shadow-sm hover:bg-slate-50"
        title={isFullscreen ? "Sluiten (Esc)" : "Volledig scherm"}
      >
        {isFullscreen ? "✕" : "⛶"}
      </button>

      <MapContainer
        center={center}
        zoom={13}
        className={`h-full w-full ${isFullscreen ? "" : "rounded-xl"}`}
        style={{ background: "#e2e8f0" }}
        zoomControl={false}
        maxZoom={18}
      >
        <TileLayer
          key={tileStyle}
          url={tileProps.url}
          attribution={tileProps.attribution}
          maxZoom={tileProps.maxZoom}
          {...(tileProps.subdomains ? { subdomains: tileProps.subdomains } : {})}
        />
        <ZoomControl position="topright" />
        <MapController vehicles={vehicles} selectedId={selectedId} followId={followId} />
        <ClickHandler onMapClick={onMapClick} />
        <SearchControl onSaveSelection={onSaveSelection} />
        <ContextMenuHandler onSaveAsLocation={onSaveAsLocation} />
        <LocateButton />

        {trailPath.length > 1 && (
          <Polyline
            positions={trailPath}
            pathOptions={{
              color: "#38bdf8",
              weight: 3,
              opacity: 0.75,
              lineJoin: "round",
            }}
          />
        )}

        {/* Geofence-zones (achter andere lagen) */}
        {zones.map((z) => (
          <Polygon
            key={z.id}
            positions={z.coordinates}
            pathOptions={{
              color: z.color,
              fillColor: z.color,
              fillOpacity: 0.14,
              weight: 2,
            }}
          >
            <Popup>
              <strong style={{ fontSize: 13 }}>⬡ {z.name}</strong>
              {z.description && (
                <>
                  <br />
                  <span style={{ fontSize: 12, color: "#64748b" }}>{z.description}</span>
                </>
              )}
              <br />
              <span style={{ fontSize: 11, color: "#94a3b8" }}>Geofence-zone</span>
            </Popup>
          </Polygon>
        ))}

        {/* Beheerde locaties */}
        {locations.map((loc) => (
          <Marker key={loc.id} position={[loc.latitude, loc.longitude]} icon={locationIcon(loc)}>
            <Popup>
              <strong style={{ fontSize: 13 }}>
                {loc.type === "temporary" ? "🟠" : "🔵"} {loc.name}
              </strong>
              <br />
              <span style={{ fontSize: 12, color: "#64748b" }}>{loc.address}</span>
              <br />
              <span style={{ fontSize: 11, color: loc.isExpired ? "#94a3b8" : "#f97316" }}>
                {loc.type === "temporary"
                  ? loc.isExpired
                    ? "Tijdelijk — verlopen"
                    : `Tijdelijk${loc.expiresAt ? ` — t/m ${new Date(loc.expiresAt).toLocaleString("nl-NL")}` : ""}`
                  : "Permanent"}
              </span>
              {loc.notes && (
                <>
                  <br />
                  <span style={{ fontSize: 12 }}>{loc.notes}</span>
                </>
              )}
              <br />
              <span style={{ fontSize: 11, color: "#94a3b8" }}>
                {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
              </span>
            </Popup>
          </Marker>
        ))}

        {/* Routevisualisatie */}
        {routeLine && routePositions.length > 1 && (
          <Polyline
            positions={routePositions}
            pathOptions={{
              color: "#2563eb",
              weight: 4,
              opacity: 0.85,
              lineJoin: "round",
              dashArray: routeLine.roadRoute ? undefined : "8 6",
            }}
          />
        )}
        {routeLine?.points.map((p) => (
          <Marker key={`${p.order}-${p.kind}`} position={p.pos} icon={routePointIcon(p.kind, p.order)}>
            <Popup>
              <strong style={{ fontSize: 13 }}>
                {p.order}. {p.name}
              </strong>
              <br />
              <span style={{ fontSize: 11, color: "#94a3b8" }}>
                {p.kind === "start" ? "Startpunt" : p.kind === "end" ? "Eindpunt" : "Via-punt"}
              </span>
            </Popup>
          </Marker>
        ))}

        {vehicles.map((v) => (
          <Marker
            key={v.id}
            position={[v.latitude, v.longitude]}
            icon={vehicleIcon(
              v.iconEmoji,
              v.name,
              v.moving,
              v.id === selectedId,
              showNames,
              showSpeed,
              v.speedKmh
            )}
            eventHandlers={{
              click: (e) => {
                e.originalEvent.stopPropagation();
                onSelect?.(v.id);
              },
            }}
          >
            <Popup>
              <strong style={{ fontSize: 14 }}>
                {v.iconEmoji} {v.name}
              </strong>
              <br />
              <span style={{ color: v.moving ? "#16a34a" : "#64748b" }}>
                {v.moving ? "▶ beweegt" : "⏸ stilstaand"}
              </span>
              <br />
              {v.speedKmh != null ? `${v.speedKmh} km/u` : "snelheid —"}
              <br />
              {new Date(v.observedAt).toLocaleTimeString()}
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {showLegend && (
        <MapLegend
          extra={legendExtra}
          hasVehicles={vehicles.length > 0}
          hasZones={zones.length > 0}
          hasLocations={locations.length > 0}
          hasRoute={!!routeLine && routeLine.points.length > 0}
        />
      )}

      {routeLine && routeLine.roadRouteInfo && (
        <div className="absolute bottom-3 right-3 z-[10] rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 text-xs text-slate-600 shadow-sm">
          🛣️ Straatroute: {routeLine.roadRouteInfo.distanceKm} km ·{" "}
          {routeLine.roadRouteInfo.durationMin} min (OSRM)
        </div>
      )}
      {routeLine && !routeLine.roadRouteInfo && routeLine.points.length > 1 && (
        <div className="absolute bottom-3 right-3 z-[10] rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700 shadow-sm">
          Rechte lijn tussen punten — geen navigatie-route beschikbaar
        </div>
      )}
    </div>
  );
}
