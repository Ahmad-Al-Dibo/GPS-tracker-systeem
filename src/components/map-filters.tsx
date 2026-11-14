"use client";

// Kaartfilter-paneel: zwevende knop + lagen-schakelaars (sectie 9)
// Toont alleen filters voor lagen die de pagina daadwerkelijk ondersteunt.
import { useEffect, useRef, useState } from "react";
import type { MapFilterState, AvailableLayers } from "@/lib/map-filters";

type LayerMeta = {
  key: keyof MapFilterState;
  label: string;
  icon: string;
  group: "basis" | "locaties";
};

const LAYER_META: LayerMeta[] = [
  { key: "vehicles", label: "Voertuigen", icon: "🚚", group: "basis" },
  { key: "zones", label: "Geofences", icon: "⬡", group: "basis" },
  { key: "locationsPermanent", label: "Locaties (permanent)", icon: "🔵", group: "locaties" },
  { key: "locationsTemporary", label: "Locaties (tijdelijk)", icon: "🟠", group: "locaties" },
  { key: "locationsExpired", label: "Locaties (verlopen)", icon: "⚪", group: "locaties" },
  { key: "route", label: "Route", icon: "🛣️", group: "basis" },
];

export default function MapFilterControl({
  state,
  available,
  onToggle,
}: {
  state: MapFilterState;
  available: AvailableLayers;
  onToggle: (key: keyof MapFilterState) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Sluit bij klikken buiten het paneel
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const layers = LAYER_META.filter((m) => available[m.key]);
  if (layers.length === 0) return null;

  const groups: { key: "basis" | "locaties"; label: string }[] = [
    { key: "basis", label: "Kaartlagen" },
    { key: "locaties", label: "Beheerde locaties" },
  ];

  const activeCount = layers.filter((l) => state[l.key]).length;

  return (
    <div ref={ref} className="absolute right-3 top-[3.75rem] z-[10]">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        title="Kaartfilters"
        aria-expanded={open}
      >
        🗂️ Filters
        <span className="rounded-full bg-blue-100 px-1.5 text-xs text-blue-700">
          {activeCount}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          {groups.map((g) => {
            const groupLayers = layers.filter((l) => l.group === g.key);
            if (groupLayers.length === 0) return null;
            return (
              <div key={g.key} className="mb-2 last:mb-0">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {g.label}
                </p>
                {groupLayers.map((l) => (
                  <label
                    key={l.key}
                    className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={state[l.key]}
                      onChange={() => onToggle(l.key)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>{l.icon}</span>
                    <span>{l.label}</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
