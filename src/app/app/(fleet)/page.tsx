"use client";

// Dashboard — overzicht met stats, kaart (voertuigen + geofences + locaties)
// en recente activiteit
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import MapFilterControl from "@/components/map-filters";
import { useMapFilters, applyLocationFilters } from "@/lib/map-filters";
import type { MapZone, MapLocation } from "@/components/tracking-map";

const TrackingMap = dynamic(() => import("@/components/tracking-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center rounded-xl bg-slate-100 text-slate-400">
      Kaart laden…
    </div>
  ),
});

type Overview = {
  totalVehicles: number;
  online: number;
  offline: number;
  moving: number;
  openEvents: number;
  openTasks: number;
  recentEvents: {
    id: string;
    vehicleName: string;
    ruleName: string;
    severity: string;
    startTime: string;
  }[];
};

type Source = {
  id: string;
  name: string;
  displayName: string;
  iconEmoji: string;
  licensePlate: string | null;
  brand: string | null;
  vehicleType: string | null;
  latitude: number | null;
  longitude: number | null;
  speedKmh: number | null;
  moving: boolean;
  status: string;
  sampledAt: string | null;
  persons: { id: string; name: string }[];
};

const sevIcon: Record<string, string> = {
  info: "ℹ️",
  warning: "⚠️",
  critical: "🚨",
};

export default function OverviewPage() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zones, setZones] = useState<MapZone[]>([]);
  const [rawLocations, setRawLocations] = useState<MapLocation[]>([]);

  // Kaartfilters: dashboard toont voertuigen + geofences + actieve locaties
  const { state: filterState, visible, toggle } = useMapFilters(
    {},
    {
      vehicles: true,
      zones: true,
      locationsPermanent: true,
      locationsTemporary: true,
      locationsExpired: false,
    }
  );

  const load = useCallback(async () => {
    const [ovRes, srcRes, zRes, locRes] = await Promise.all([
      fetch("/api/overview"),
      fetch("/api/vehicles"),
      fetch("/api/geofences"),
      fetch("/api/locations?status=active"),
    ]);
    if (ovRes.ok) setData(await ovRes.json());
    if (srcRes.ok) {
      const d = await srcRes.json();
      setSources(d.vehicles);
    }
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
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [load]);

  const visibleLocations = useMemo(
    () => applyLocationFilters(rawLocations, visible),
    [rawLocations, visible]
  );

  /** Rechtermuisknop → navigeer naar Locaties-module met selectie. */
  const onSaveAsLocation = useCallback(
    (sel: { pos: [number, number]; label: string }) => {
      const params = new URLSearchParams({
        selLat: String(sel.pos[0]),
        selLon: String(sel.pos[1]),
        selLabel: sel.label,
      });
      router.push(`/app/locations?${params}`);
    },
    [router]
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
      observedAt: s.sampledAt ?? new Date().toISOString(),
    }));

  const stats = [
    { label: "Voertuigen", value: data?.totalVehicles, icon: "🚗", color: "bg-blue-50 text-blue-600" },
    { label: "Online", value: data?.online, icon: "🟢", color: "bg-green-50 text-green-600" },
    { label: "Offline", value: data?.offline, icon: "🔴", color: "bg-red-50 text-red-600" },
    { label: "Bewegend", value: data?.moving, icon: "▶️", color: "bg-emerald-50 text-emerald-600" },
  ];

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 lg:mb-6">
        <h1 className="text-xl font-bold lg:text-2xl">Dashboard</h1>
        <p className="text-sm text-slate-500">Live voertuiglocaties</p>
      </div>

      {/* Stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:mb-6 lg:grid-cols-4 lg:gap-4">
        {stats.map((s) => (
          <div key={s.label} className="stat-card rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-lg ${s.color}`}>
                {s.icon}
              </span>
              <div className="min-w-0">
                <p className="text-2xl font-bold tracking-tight text-slate-900">{s.value ?? "—"}</p>
                <p className="truncate text-xs font-medium text-slate-500">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px] lg:gap-6">
        {/* Kaart */}
        <div className="relative h-[350px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:h-[500px]">
          <TrackingMap
            vehicles={visible.vehicles ? mapVehicles : []}
            zones={visible.zones ? zones : []}
            locations={visibleLocations}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMapClick={() => setSelectedId(null)}
            showNames={true}
            showSpeed={true}
            onSaveAsLocation={onSaveAsLocation}
            showLegend
          />
          <MapFilterControl
            state={filterState}
            available={{
              vehicles: true,
              zones: true,
              locationsPermanent: true,
              locationsTemporary: true,
              locationsExpired: false,
            }}
            onToggle={toggle}
          />
        </div>

        {/* Zijbalk */}
        <div className="flex flex-col gap-4">
          {/* Snelle info geselecteerd voertuig */}
          {selectedId && (() => {
            const v = sources.find((s) => s.id === selectedId);
            if (!v) return null;
            return (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xl">{v.iconEmoji}</span>
                  <div>
                    <p className="font-semibold text-slate-900">{v.displayName}</p>
                    {v.licensePlate && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                        {v.licensePlate}
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-1 text-xs text-slate-500">
                  <p>{v.brand} {v.vehicleType}</p>
                  {v.speedKmh != null && (
                    <p className={v.moving ? "font-medium text-green-600" : ""}>
                      {v.moving ? "▶" : "⏸"} {v.speedKmh} km/u
                    </p>
                  )}
                  {v.persons.length > 0 && (
                    <p>👤 {v.persons.map((p) => p.name).join(", ")}</p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Recente activiteit */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Recente activiteit</h2>
            {!data?.recentEvents?.length ? (
              <p className="text-xs text-slate-400">Geen recente events.</p>
            ) : (
              <ul className="space-y-2.5">
                {data.recentEvents.map((e) => (
                  <li key={e.id} className="flex items-start gap-2.5">
                    <span className="mt-0.5 text-sm">{sevIcon[e.severity] ?? "ℹ️"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-slate-800">
                        {e.vehicleName}
                      </p>
                      <p className="truncate text-xs text-slate-500">{e.ruleName}</p>
                      <p className="text-[10px] text-slate-400">
                        {new Date(e.startTime).toLocaleString()}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Open taken */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Open taken</h2>
            <p className="text-2xl font-bold text-slate-900">{data?.openTasks ?? "—"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
