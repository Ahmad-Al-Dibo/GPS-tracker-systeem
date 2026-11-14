"use client";

// Trips & Historie-pagina
import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { toMapVehicles } from "@/lib/map-data";
import { useIngestSources } from "@/lib/use-map-data";

const TrackingMap = dynamic(() => import("@/components/tracking-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center rounded-xl bg-white text-slate-400">
      Kaart laden…
    </div>
  ),
});

type TrailPoint = {
  latitude: number;
  longitude: number;
  speedMps: number | null;
  sampledAt: string;
};

export default function HistoryPage() {
  // Eénmalig laden (geen poll — historie verandert niet tijdens het kijken)
  const { sources, error: sourcesError } = useIngestSources(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trail, setTrail] = useState<TrailPoint[]>([]);
  const [limit, setLimit] = useState(500);
  const [trailError, setTrailError] = useState<string | null>(null);
  const [trailLoading, setTrailLoading] = useState(false);
  const trailSeqRef = useRef(0);

  const loadTrail = useCallback(
    async (sourceId: string, pointLimit: number) => {
      const src = sources.find((s) => s.id === sourceId);
      if (!src) return;
      // Sequence-guard: een tragere oudere request mag de nieuwere trail niet
      // overschrijven (wisselen tussen voertuigen/limits).
      const seq = ++trailSeqRef.current;
      setTrailLoading(true);
      setTrailError(null);
      try {
        const res = await fetch(
          `/api/ingest/sources/${encodeURIComponent(src.name)}?limit=${pointLimit}`
        );
        if (seq !== trailSeqRef.current) return;
        if (!res.ok) {
          setTrail([]);
          setTrailError(`Trail laden mislukt (${res.status})`);
          return;
        }
        const d = await res.json();
        if (seq !== trailSeqRef.current) return;
        setTrail(d.trail);
      } catch {
        if (seq === trailSeqRef.current) {
          setTrail([]);
          setTrailError("Netwerkfout bij trail laden");
        }
      } finally {
        if (seq === trailSeqRef.current) setTrailLoading(false);
      }
    },
    [sources]
  );

  const mapVehicles = toMapVehicles(sources);
  const trailPath = trail.map((p) => [p.latitude, p.longitude] as [number, number]);
  const error = sourcesError ?? trailError;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-bold">Trips & Historie</h1>
        <p className="text-sm text-slate-400">
          Bekijk historische routes van voertuigen
        </p>
        {error && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-600">
            {error}
          </p>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_1fr]">
        <aside className="overflow-y-auto border-r border-slate-200 p-4">
          <label className="mb-3 block text-sm text-slate-400">
            Voertuig
            <select
              value={selectedId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                setSelectedId(id);
                if (id) void loadTrail(id, limit);
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
                // Nieuw limit méteen doorgeven: de vorige code riep loadTrail
                // aan met de gesloten OUDE limit-state (stale waarde).
                const next = Number(e.target.value);
                setLimit(next);
                if (selectedId) void loadTrail(selectedId, next);
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

          {trailLoading && (
            <p className="text-xs text-slate-400">Trail laden…</p>
          )}

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
              void loadTrail(id, limit);
            }}
          />
        </section>
      </div>
    </div>
  );
}
