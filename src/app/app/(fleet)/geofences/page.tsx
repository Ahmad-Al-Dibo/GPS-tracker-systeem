"use client";

// Geofences-pagina — polygon tekenen op de kaart
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";

const PolygonEditor = dynamic(() => import("@/components/polygon-editor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[350px] items-center justify-center rounded-xl bg-slate-100 text-slate-400">
      Kaart laden…
    </div>
  ),
});

type Geofence = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  coordinates: string;
  isActive: boolean;
  createdAt: string;
};

export default function GeofencesPage() {
  const [me, setMe] = useState<{ role: string } | null>(null);
  const [fences, setFences] = useState<Geofence[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", color: "#2563eb" });
  const [coords, setCoords] = useState<[number, number][]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<Geofence | null>(null);

  const load = useCallback(async () => {
    const [meRes, res] = await Promise.all([
      fetch("/api/me"),
      fetch("/api/geofences"),
    ]);
    if (meRes.ok) setMe(await meRes.json());
    if (res.ok) {
      const d = await res.json();
      setFences(d.geofences);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isAdmin = me?.role === "admin";

  async function save() {
    if (!form.name.trim()) {
      setError("Naam is verplicht");
      return;
    }
    if (coords.length < 3) {
      setError("Teken minimaal 3 punten op de kaart voor een polygon");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/geofences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description || null,
          color: form.color,
          coordinates: JSON.stringify(coords),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? `Fout ${res.status}`);
        return;
      }
      setShowForm(false);
      setForm({ name: "", description: "", color: "#2563eb" });
      setCoords([]);
      void load();
    } catch {
      setError("Netwerkfout");
    } finally {
      setSaving(false);
    }
  }

  async function deleteFence(id: string) {
    if (!confirm("Geofence verwijderen?")) return;
    await fetch(`/api/geofences/${id}`, { method: "DELETE" });
    void load();
  }

  function parseCoords(coordsStr: string): [number, number][] {
    try {
      return JSON.parse(coordsStr);
    } catch {
      return [];
    }
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold lg:text-2xl">Geofences</h1>
          <p className="text-sm text-slate-500">
            Teken zones op de kaart voor regels en monitoring
            {!isAdmin && " · alleen-lezen"}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => {
              setShowForm(true);
              setCoords([]);
              setError(null);
            }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + Nieuwe geofence
          </button>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
      )}

      {/* Nieuw geofence formulier */}
      {showForm && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
          <h2 className="mb-4 font-semibold text-slate-900">Nieuwe geofence</h2>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <label className="text-sm text-slate-700">
              Naam *
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Bijv. Bezorgzone Noord"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
              />
            </label>
            <label className="text-sm text-slate-700">
              Beschrijving
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optioneel"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
              />
            </label>
            <label className="text-sm text-slate-700">
              Kleur
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="h-9 w-12 rounded border border-slate-300"
                />
                <span className="font-mono text-xs text-slate-500">{form.color}</span>
              </div>
            </label>
          </div>

          {/* Polygon-tekenaar */}
          <div className="mb-3">
            <p className="mb-2 text-sm font-medium text-slate-700">
              Teken de zone op de kaart
            </p>
            <PolygonEditor
              onChange={(c) => setCoords(c)}
              readOnly={false}
            />
            <p className="mt-2 text-xs text-slate-400">
              Klik op de kaart om punten te plaatsen. Bij 3+ punten sluit de zone
              automatisch. 🔴 = startpunt, 🔵 = overige punten.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving || coords.length < 3 || !form.name.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Bezig…" : "Opslaan"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Annuleren
            </button>
            <span className="text-xs text-slate-400">
              {coords.length} punten getekend
            </span>
          </div>
        </div>
      )}

      {/* Bekijk-modus */}
      {viewing && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-4 w-4 rounded"
                style={{ backgroundColor: viewing.color }}
              />
              <h2 className="font-semibold text-slate-900">{viewing.name}</h2>
            </div>
            <button
              onClick={() => setViewing(null)}
              className="text-sm text-slate-400 hover:text-slate-600"
            >
              ✕ Sluiten
            </button>
          </div>
          {viewing.description && (
            <p className="mb-3 text-sm text-slate-500">{viewing.description}</p>
          )}
          <PolygonEditor
            initialCoords={parseCoords(viewing.coordinates)}
            readOnly={true}
          />
        </div>
      )}

      {/* Geofence-lijst */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fences.map((f) => (
          <div
            key={f.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-2 flex items-center gap-2">
              <span
                className="inline-block h-4 w-4 rounded"
                style={{ backgroundColor: f.color }}
              />
              <h3 className="font-semibold text-slate-900">{f.name}</h3>
            </div>
            {f.description && (
              <p className="mb-2 text-sm text-slate-500">{f.description}</p>
            )}
            <p className="text-xs text-slate-400">
              {parseCoords(f.coordinates).length} punten ·{" "}
              {f.isActive ? "Actief" : "Inactief"}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setViewing(f)}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200"
              >
                Bekijken
              </button>
              {isAdmin && (
                <button
                  onClick={() => void deleteFence(f.id)}
                  className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-100"
                >
                  Verwijderen
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {fences.length === 0 && (
        <p className="p-10 text-center text-sm text-slate-400">
          Nog geen geofences. Teken een zone op de kaart.
        </p>
      )}
    </div>
  );
}
