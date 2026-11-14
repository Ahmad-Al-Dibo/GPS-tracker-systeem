"use client";

// Dashboard — overzicht met stats, kaart (voertuigen + geofences + locaties)
// en recente activiteit
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import MapFilterControl from "@/components/map-filters";
import { useMapFilters, applyLocationFilters } from "@/lib/map-filters";
import { toMapVehicles } from "@/lib/map-data";
import { useVehicleList, useMapLayers } from "@/lib/use-map-data";

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

const sevIcon: Record<string, string> = {
  info: "ℹ️",
  warning: "⚠️",
  critical: "🚨",
};

export default function OverviewPage() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Voertuigen (10s) + kaartlagen (10s) via gedeelde hooks; overview haalt
  // de pagina zelf op (dashboard-specifieke statistieken).
  const { vehicles, error: vehiclesError } = useVehicleList(10_000);
  const { zones, locations: layerLocations, error: layersError } = useMapLayers(10_000);

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

  const loadOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/overview", { cache: "no-store" });
      if (!res.ok) throw new Error(`Fout ${res.status}`);
      setData(await res.json());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Netwerkfout");
    }
  }, []);

  useEffect(() => {
    void loadOverview();
    const t = setInterval(() => void loadOverview(), 10_000);
    return () => clearInterval(t);
  }, [loadOverview]);

  const visibleLocations = useMemo(
    () => applyLocationFilters(layerLocations, visible),
    [layerLocations, visible]
  );

  const mapVehicles = useMemo(() => toMapVehicles(vehicles), [vehicles]);

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

  const error = loadError ?? vehiclesError ?? layersError;

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

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
          {error} — getoonde gegevens zijn mogelijk verouderd.
        </p>
      )}

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
            const v = vehicles.find((s) => s.id === selectedId);
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
                  {v.persons && v.persons.length > 0 && (
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
