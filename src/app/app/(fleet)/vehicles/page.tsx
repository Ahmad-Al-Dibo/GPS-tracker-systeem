"use client";

// Voertuigen-pagina — light theme
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorBanner } from "@/components/ui";

type Vehicle = {
  id: string;
  name: string;
  displayName: string;
  licensePlate: string | null;
  brand: string | null;
  vehicleType: string | null;
  color: string | null;
  yearOfBuild: number | null;
  startingKm: number | null;
  currentKm: number | null;
  totalDistanceKm: number | null;
  vehicleGroup: string | null;
  iconEmoji: string;
  isActive: boolean;
  trackerSerial: string | null;
  latitude: number | null;
  longitude: number | null;
  speedKmh: number | null;
  receivedAt: string;
  persons: { id: string; name: string }[];
};

export default function VehiclesPage() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", displayName: "", licensePlate: "", brand: "", vehicleType: "",
    color: "", yearOfBuild: "", startingKm: "", vehicleGroup: "", notes: "",
    iconEmoji: "🚗", trackerSerial: "", trackerBrand: "", trackerType: "",
    simCardNumber: "", trackerSource: "app",
  });

  const load = useCallback(async () => {
    const res = await fetch("/api/vehicles");
    if (res.ok) {
      const d = await res.json();
      setVehicles(d.vehicles);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!form.name.trim()) { setError("Naam is verplicht"); return; }
    setError(null);
    try {
      const res = await fetch("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          yearOfBuild: form.yearOfBuild ? Number(form.yearOfBuild) : null,
          startingKm: form.startingKm ? Number(form.startingKm) : null,
          licensePlate: form.licensePlate || null, brand: form.brand || null,
          vehicleType: form.vehicleType || null, color: form.color || null,
          vehicleGroup: form.vehicleGroup || null, notes: form.notes || null,
          trackerSerial: form.trackerSerial || null, trackerBrand: form.trackerBrand || null,
          trackerType: form.trackerType || null, simCardNumber: form.simCardNumber || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? `Fout ${res.status}`);
        return;
      }
      setShowForm(false);
      void load();
    } catch { setError("Netwerkfout"); }
  }

  const filtered = vehicles.filter(
    (v) =>
      v.displayName.toLowerCase().includes(search.toLowerCase()) ||
      (v.licensePlate ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (v.brand ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const isOnline = (r: string) => Date.now() - new Date(r).getTime() < 120_000;

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold lg:text-2xl">Voertuigen</h1>
          <p className="text-sm text-slate-500">Beheer je voertuigen</p>
        </div>
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek voertuigen…"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
          />
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + Voertuig
          </button>
        </div>
      </div>

      {error && (
        <ErrorBanner>{error}</ErrorBanner>
      )}

      {/* Formulier */}
      {showForm && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
          <h2 className="mb-4 font-semibold text-slate-900">Nieuw voertuig</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { key: "name", label: "Naam *", ph: "Interne naam" },
              { key: "displayName", label: "Weergave-naam", ph: "Bezorgbus 1" },
              { key: "licensePlate", label: "Kenteken", ph: "K-123-AB" },
              { key: "brand", label: "Merk", ph: "Volkswagen" },
              { key: "vehicleType", label: "Type", ph: "Transporter" },
              { key: "color", label: "Kleur", ph: "Wit" },
            ].map((f) => (
              <label key={f.key} className="text-sm text-slate-700">
                {f.label}
                <input
                  value={(form as Record<string, string>)[f.key] ?? ""}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.ph}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                />
              </label>
            ))}
            <label className="text-sm text-slate-700">
              Bouwjaar
              <input type="number" value={form.yearOfBuild}
                onChange={(e) => setForm({ ...form, yearOfBuild: e.target.value })}
                placeholder="2022"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
              />
            </label>
            <label className="text-sm text-slate-700">
              Start-km
              <input type="number" value={form.startingKm}
                onChange={(e) => setForm({ ...form, startingKm: e.target.value })}
                placeholder="0"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
              />
            </label>
            <label className="text-sm text-slate-700">
              Groep
              <input value={form.vehicleGroup}
                onChange={(e) => setForm({ ...form, vehicleGroup: e.target.value })}
                placeholder="Bezorging"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
              />
            </label>
            <label className="text-sm sm:col-span-2 lg:col-span-3 text-slate-700">
              Notities
              <textarea value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
              />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={save} disabled={!form.name.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              Aanmaken
            </button>
            <button onClick={() => setShowForm(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              Annuleren
            </button>
          </div>
        </div>
      )}

      {/* Tabel */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr>
                <th className="px-4 py-3">Voertuig</th>
                <th className="hidden px-4 py-3 sm:table-cell">Kenteken</th>
                <th className="hidden px-4 py-3 md:table-cell">Tracker</th>
                <th className="px-4 py-3">Status</th>
                <th className="hidden px-4 py-3 lg:table-cell">Personen</th>
                <th className="px-4 py-3">Actie</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                  onClick={() => router.push(`/app/vehicles/${v.id}`)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">{v.iconEmoji}</span>
                      <div>
                        <p className="font-medium text-slate-900">{v.displayName}</p>
                        <p className="text-xs text-slate-500">{v.brand} {v.vehicleType}</p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    {v.licensePlate ? (
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
                        {v.licensePlate}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    {v.trackerSerial ? (
                      <span className="font-mono text-xs text-slate-500">{v.trackerSerial}</span>
                    ) : <span className="text-xs text-slate-300">Geen tracker</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      isOnline(v.receivedAt)
                        ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        isOnline(v.receivedAt) ? "bg-green-500" : "bg-slate-400"
                      }`} />
                      {isOnline(v.receivedAt) ? "Online" : "Offline"}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-slate-500 lg:table-cell">
                    {v.persons.length > 0 ? v.persons.map((p) => p.name).join(", ") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={(e) => { e.stopPropagation(); router.push(`/app/vehicles/${v.id}`); }}
                      className="whitespace-nowrap text-sm font-medium text-blue-600 hover:text-blue-700">
                      Details<span className="hidden sm:inline"> →</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <p className="p-10 text-center text-sm text-slate-400">
            {search ? "Geen resultaten." : "Nog geen voertuigen. Voeg er een toe."}
          </p>
        )}
      </div>
    </div>
  );
}
