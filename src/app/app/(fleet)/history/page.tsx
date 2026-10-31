"use client";

// Trips & Historie-pagina
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";

const TrackingMap = dynamic(() => import("@/components/tracking-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center rounded-xl bg-white text-slate-400">
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
};

type TrailPoint = {
  latitude: number;
  longitude: number;
  speedMps: number | null;
  sampledAt: string;
};

export default function HistoryPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trail, setTrail] = useState<TrailPoint[]>([]);
  const [limit, setLimit] = useState(500);

  const loadSources = useCallback(async () => {
    const res = await fetch("/api/ingest/sources");
    if (res.ok) {
      const d = await res.json();
      setSources(d.sources);
    }
  }, []);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  const loadTrail = useCallback(
    async (sourceId: string) => {
      const src = sources.find((s) => s.id === sourceId);
      if (!src) return;
      const res = await fetch(
        `/api/ingest/sources/${encodeURIComponent(src.name)}?limit=${limit}`
      );
      if (res.ok) {
        const d = await res.json();
        setTrail(d.trail);
      }
    },
    [sources, limit]
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

  const trailPath = trail.map((p) => [p.latitude, p.longitude] as [number, number]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-bold">Trips & Historie</h1>
        <p className="text-sm text-slate-400">
          Bekijk historische routes van voertuigen
        </p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_1fr]">
        <aside className="overflow-y-auto border-r border-slate-200 p-4">
          <label className="mb-3 block text-sm text-slate-400">
            Voertuig
            <select
              value={selectedId ?? ""}
              onChange={(e) => {
                setSelectedId(e.target.value || null);
                if (e.target.value) void loadTrail(e.target.value);
                else setTrail([]);
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Kies voertuig…</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.iconEmoji} {s.displayName}
                </option>
              ))}
            </select>
          </label>

          <label className="mb-4 block text-sm text-slate-400">
            Aantal punten
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                if (selectedId) void loadTrail(selectedId);
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value={100}>100</option>
              <option value={300}>300</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
              <option value={2000}>2000</option>
            </select>
          </label>

          {trail.length > 0 && (
            <div className="rounded-lg bg-white p-3 text-sm">
              <p className="font-medium">{trail.length} punten geladen</p>
              <p className="text-xs text-slate-400">
                Van {new Date(trail[0].sampledAt).toLocaleString()} tot{" "}
                {new Date(trail[trail.length - 1].sampledAt).toLocaleString()}
              </p>
            </div>
          )}
        </aside>

        <section className="relative min-h-0">
          <TrackingMap
            vehicles={mapVehicles}
            selectedId={selectedId}
            trail={trailPath.length > 1 ? trailPath : undefined}
            onSelect={(id) => {
              setSelectedId(id);
              void loadTrail(id);
            }}
          />
        </section>
      </div>
    </div>
  );
}

