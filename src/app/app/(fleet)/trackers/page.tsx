"use client";

// GPS-trackers-pagina — light theme, app-bron = alleen naam verplicht
import { useCallback, useEffect, useState } from "react";
import { ErrorBanner } from "@/components/ui";
import { apiRequest, jsonRequest } from "@/lib/http";

type Tracker = {
  id: string;
  name: string;
  serialNumber: string | null;
  brand: string | null;
  trackerType: string | null;
  simCardNumber: string | null;
  sourceType: string;
  isActive: boolean;
  lastSeen: string;
  latitude: number | null;
  longitude: number | null;
  vehicleName: string;
  vehicleLicensePlate: string | null;
  createdAt: string;
};

type VehicleOption = { id: string; displayName: string; licensePlate: string | null };

export default function TrackersPage() {
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    serialNumber: "",
    brand: "",
    trackerType: "",
    simCardNumber: "",
    sourceType: "app",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [tRes, vRes] = await Promise.all([
        fetch("/api/trackers"),
        fetch("/api/vehicles"),
      ]);
      if (!tRes.ok || !vRes.ok) throw new Error("fetch failed");
      const t = await tRes.json();
      setTrackers(t.trackers);
      const v = await vRes.json();
      setVehicles(
        v.vehicles.map((veh: { id: string; displayName: string; licensePlate: string | null }) => ({
          id: veh.id,
          displayName: veh.displayName,
          licensePlate: veh.licensePlate,
        }))
      );
    } catch {
      setError("Trackers laden mislukt");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!form.name.trim()) {
      setError("Naam is verplicht");
      return;
    }
    // Alleen fysieke trackers vereisen serienummer
    if (form.sourceType === "physical" && !form.serialNumber.trim()) {
      setError("Serienummer is verplicht voor fysieke trackers");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await apiRequest("/api/trackers", jsonRequest("POST", {
        name: form.name.trim(),
        serialNumber: form.serialNumber.trim() || `APP-${Date.now()}`,
        brand: form.brand || null,
        trackerType: form.trackerType || null,
        simCardNumber: form.simCardNumber || null,
        sourceType: form.sourceType,
      }));
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setShowForm(false);
      setForm({ name: "", serialNumber: "", brand: "", trackerType: "", simCardNumber: "", sourceType: "app" });
      void load();
    } finally {
      setSaving(false);
    }
  }

  async function linkToVehicle(trackerId: string, vehicleId: string) {
    if (!vehicleId) return;
    const tracker = trackers.find((t) => t.id === trackerId);
    if (!tracker) return;
    await fetch(`/api/vehicles/${vehicleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trackerSerial: tracker.serialNumber,
        trackerBrand: tracker.brand,
        trackerType: tracker.trackerType,
        simCardNumber: tracker.simCardNumber,
        trackerSource: tracker.sourceType,
      }),
    });
    void load();
  }

  const isOnline = (lastSeen: string) =>
    Date.now() - new Date(lastSeen).getTime() < 120_000;

  const isApp = form.sourceType === "app";

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold lg:text-2xl">GPS-trackers</h1>
          <p className="text-sm text-slate-500">{trackers.length} trackers</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + Tracker
        </button>
      </div>

      <ErrorBanner>{error}</ErrorBanner>

      {/* Nieuw tracker formulier */}
      {showForm && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
          <h2 className="mb-4 font-semibold text-slate-900">Nieuwe GPS-tracker</h2>

          {/* Bron-keuze */}
          <div className="mb-4">
            <p className="mb-2 text-sm font-medium text-slate-700">Bron</p>
            <div className="flex gap-3">
              {[
                { value: "app", label: "📱 App (telefoon)", desc: "Alleen naam verplicht" },
                { value: "physical", label: "📡 Fysiek apparaat", desc: "Serienummer verplicht" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setForm({ ...form, sourceType: opt.value })}
                  className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
                    form.sourceType === opt.value
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900">{opt.label}</p>
                  <p className="text-xs text-slate-500">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-700">
              Naam * (altijd verplicht)
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Bijv. Ahmad's telefoon"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
              />
            </label>

            {!isApp && (
              <label className="text-sm text-slate-700">
                Serienummer * (verplicht voor fysiek)
                <input
                  value={form.serialNumber}
                  onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                  placeholder="SN-001234"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                />
              </label>
            )}

            <label className="text-sm text-slate-700">
              Merk {isApp && <span className="text-slate-400">(optioneel)</span>}
              <input
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder={isApp ? "Optioneel" : "Teltonika"}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
              />
            </label>

            <label className="text-sm text-slate-700">
              Type {isApp && <span className="text-slate-400">(optioneel)</span>}
              <input
                value={form.trackerType}
                onChange={(e) => setForm({ ...form, trackerType: e.target.value })}
                placeholder={isApp ? "Optioneel" : "FMC920"}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
              />
            </label>

            <label className="text-sm text-slate-700">
              SIM-kaartnummer {isApp && <span className="text-slate-400">(optioneel)</span>}
              <input
                value={form.simCardNumber}
                onChange={(e) => setForm({ ...form, simCardNumber: e.target.value })}
                placeholder={isApp ? "Optioneel" : "8931..."}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
              />
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={save}
              disabled={saving || !form.name.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Bezig…" : "Aanmaken"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Annuleren
            </button>
          </div>
        </div>
      )}

      {/* Tracker-lijst */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr>
                <th className="px-4 py-3">Tracker</th>
                <th className="hidden px-4 py-3 sm:table-cell">Serienummer</th>
                <th className="hidden px-4 py-3 md:table-cell">Merk/Type</th>
                <th className="px-4 py-3">Bron</th>
                <th className="px-4 py-3">Status</th>
                <th className="hidden px-4 py-3 lg:table-cell">Koppelen</th>
              </tr>
            </thead>
            <tbody>
              {trackers.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.vehicleName}</p>
                  </td>
                  <td className="hidden px-4 py-3 font-mono text-xs text-slate-500 sm:table-cell">
                    {t.serialNumber ?? "—"}
                  </td>
                  <td className="hidden px-4 py-3 text-slate-500 md:table-cell">
                    {t.brand ?? "—"} {t.trackerType ? `/ ${t.trackerType}` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      t.sourceType === "physical"
                        ? "bg-blue-50 text-blue-600"
                        : "bg-green-50 text-green-600"
                    }`}>
                      {t.sourceType === "physical" ? "📡 Fysiek" : "📱 App"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      isOnline(t.lastSeen)
                        ? "bg-green-50 text-green-700"
                        : "bg-slate-100 text-slate-500"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        isOnline(t.lastSeen) ? "bg-green-500" : "bg-slate-400"
                      }`} />
                      {isOnline(t.lastSeen) ? "Online" : "Offline"}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    <select
                      value=""
                      onChange={(e) => void linkToVehicle(t.id, e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                    >
                      <option value="">Koppel aan voertuig…</option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.displayName} {v.licensePlate ? `(${v.licensePlate})` : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {trackers.length === 0 && (
          <p className="p-10 text-center text-sm text-slate-400">
            Nog geen trackers. Voeg er een toe.
          </p>
        )}
      </div>
    </div>
  );
}
