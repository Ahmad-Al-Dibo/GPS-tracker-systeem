"use client";

// Voertuig-detailpagina — light theme, mockup-stijl
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ErrorBanner } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

type VehicleDetail = {
  id: string;
  name: string;
  displayName: string;
  licensePlate: string | null;
  brand: string | null;
  vehicleType: string | null;
  color: string | null;
  yearOfBuild: number | null;
  chassisNumber: string | null;
  startingKm: number | null;
  currentKm: number | null;
  totalDistanceKm: number | null;
  vehicleGroup: string | null;
  description: string | null;
  notes: string | null;
  iconEmoji: string;
  isActive: boolean;
  trackerSerial: string | null;
  trackerBrand: string | null;
  trackerType: string | null;
  simCardNumber: string | null;
  trackerSource: string;
  latitude: number | null;
  longitude: number | null;
  speedMps: number | null;
  speedKmh: number | null;
  sampledAt: string | null;
  receivedAt: string;
  persons: { id: string; name: string; email: string | null; phone: string | null }[];
  devices: {
    id: string;
    imei: string;
    label: string | null;
    brand: string | null;
    model: string | null;
    status: string;
    connectionState: string;
    lastSeenAt: string | null;
    lastFixAt: string | null;
  }[];
  events: { id: string; ruleName: string; severity: string; status: string; startTime: string }[];
  tasks: { id: string; title: string; status: string; priority: string; assignee: string | null }[];
};

type PersonOption = { id: string; name: string };

export default function VehicleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [persons, setPersons] = useState<PersonOption[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string | number | boolean | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [linkPersonId, setLinkPersonId] = useState("");
  const [allDevices, setAllDevices] = useState<
    { id: string; imei: string; label: string | null; status: string; vehicleId: string | null }[]
  >([]);
  const [linkDeviceId, setLinkDeviceId] = useState("");
  const [deviceBusy, setDeviceBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [vRes, pRes, dRes] = await Promise.all([
      fetch(`/api/vehicles/${id}`),
      fetch("/api/persons"),
      fetch("/api/devices"),
    ]);
    if (vRes.ok) {
      const d = await vRes.json();
      setVehicle(d);
      setForm({
        displayName: d.displayName, licensePlate: d.licensePlate,
        brand: d.brand, vehicleType: d.vehicleType, color: d.color,
        yearOfBuild: d.yearOfBuild, chassisNumber: d.chassisNumber,
        startingKm: d.startingKm, vehicleGroup: d.vehicleGroup,
        notes: d.notes, iconEmoji: d.iconEmoji,
      });
    } else {
      router.push("/app/vehicles");
    }
    if (pRes.ok) {
      const d = await pRes.json();
      setPersons(d.persons.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
    }
    if (dRes.ok) {
      const d = await dRes.json();
      setAllDevices(d.devices.map((x: { id: string; imei: string; label: string | null; status: string; vehicleId: string | null }) => ({
        id: x.id, imei: x.imei, label: x.label, status: x.status, vehicleId: x.vehicleId,
      })));
    }
  }, [id, router]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setError(null);
    try {
      const res = await fetch(`/api/vehicles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? `Fout ${res.status}`);
        return;
      }
      setEditing(false);
      void load();
    } catch { setError("Netwerkfout"); }
  }

  async function remove() {
    if (!confirm("Voertuig naar de prullenbak verplaatsen? GPS-geschiedenis blijft bewaard en je kunt herstellen.")) return;
    await fetch(`/api/vehicles/${id}`, { method: "DELETE" });
    router.push("/app/vehicles");
  }

  async function linkPerson() {
    if (!linkPersonId) return;
    await fetch("/api/vehicle-persons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleId: id, personId: linkPersonId }),
    });
    setLinkPersonId("");
    void load();
  }

  async function unlinkPerson(personId: string) {
    await fetch(`/api/vehicle-persons?vehicleId=${id}&personId=${personId}`, { method: "DELETE" });
    void load();
  }

  async function linkDevice() {
    if (!linkDeviceId) return;
    setDeviceBusy(linkDeviceId);
    try {
      await fetch(`/api/devices/${linkDeviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign", vehicleId: id }),
      });
      setLinkDeviceId("");
      void load();
    } finally {
      setDeviceBusy(null);
    }
  }

  async function unlinkDevice(deviceId: string) {
    setDeviceBusy(deviceId);
    try {
      await fetch(`/api/devices/${deviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign", vehicleId: null }),
      });
      void load();
    } finally {
      setDeviceBusy(null);
    }
  }

  if (!vehicle) return <div className="p-6 text-slate-400">Laden…</div>;

  const isOnline = Date.now() - new Date(vehicle.receivedAt).getTime() < 120_000;

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => router.push("/app/vehicles")}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          ← Voertuigen
        </button>
        <div className="flex gap-2">
          <button onClick={() => setEditing(!editing)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            {editing ? "Annuleren" : "Bewerken"}
          </button>
          <button onClick={remove}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">
            Verwijderen
          </button>
        </div>
      </div>

      <ErrorBanner>{error}</ErrorBanner>

      {/* Header */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-3xl">
            {vehicle.iconEmoji}
          </span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{vehicle.displayName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {vehicle.licensePlate && (
                <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-sm text-slate-700">
                  {vehicle.licensePlate}
                </span>
              )}
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                isOnline ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-green-500" : "bg-slate-400"}`} />
                {isOnline ? "Active" : "Offline"}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {vehicle.brand} {vehicle.vehicleType}
              {vehicle.color && ` · ${vehicle.color}`}
              {vehicle.yearOfBuild && ` · ${vehicle.yearOfBuild}`}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Voertuiggegevens */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-slate-900">Voertuiggegevens</h2>
          {editing ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { key: "displayName", label: "Weergave-naam" },
                { key: "licensePlate", label: "Kenteken" },
                { key: "brand", label: "Merk" },
                { key: "vehicleType", label: "Type" },
                { key: "color", label: "Kleur" },
                { key: "chassisNumber", label: "Chassisnummer" },
              ].map((f) => (
                <label key={f.key} className="text-sm text-slate-700">
                  {f.label}
                  <input value={String(form[f.key] ?? "")}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                  />
                </label>
              ))}
              <label className="text-sm text-slate-700">
                Bouwjaar
                <input type="number" value={String(form.yearOfBuild ?? "")}
                  onChange={(e) => setForm({ ...form, yearOfBuild: e.target.value ? Number(e.target.value) : null })}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                />
              </label>
              <label className="text-sm text-slate-700">
                Start-km
                <input type="number" value={String(form.startingKm ?? "")}
                  onChange={(e) => setForm({ ...form, startingKm: e.target.value ? Number(e.target.value) : null })}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                />
              </label>
              <label className="text-sm sm:col-span-2 text-slate-700">
                Notities
                <textarea value={String(form.notes ?? "")}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                />
              </label>
              <button onClick={save}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 sm:col-span-2">
                Opslaan
              </button>
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {[
                ["Kenteken", vehicle.licensePlate],
                ["Merk", vehicle.brand],
                ["Type", vehicle.vehicleType],
                ["Kleur", vehicle.color],
                ["Bouwjaar", vehicle.yearOfBuild?.toString()],
                ["Chassisnummer", vehicle.chassisNumber],
                ["Start-km", vehicle.startingKm?.toLocaleString()],
                ["Huidige km", vehicle.currentKm?.toLocaleString()],
                ["Totaal afstand", vehicle.totalDistanceKm != null ? `${Math.round(vehicle.totalDistanceKm)} km` : null],
                ["Groep", vehicle.vehicleGroup],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-slate-400">{label}</dt>
                  <dd className="font-medium text-slate-800">{value ?? "—"}</dd>
                </div>
              ))}
              {vehicle.notes && (
                <div className="col-span-2">
                  <dt className="text-xs text-slate-400">Notities</dt>
                  <dd className="text-slate-700">{vehicle.notes}</dd>
                </div>
              )}
            </dl>
          )}
        </div>

        {/* Tracker */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-slate-900">GPS-tracker</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-slate-400">Serienummer</dt>
              <dd className="font-mono text-xs text-slate-700">{vehicle.trackerSerial ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Merk/Type</dt>
              <dd className="text-slate-700">{vehicle.trackerBrand ?? "—"} {vehicle.trackerType ? `/ ${vehicle.trackerType}` : ""}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">SIM</dt>
              <dd className="font-mono text-xs text-slate-700">{vehicle.simCardNumber ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Bron</dt>
              <dd className="text-slate-700">{vehicle.trackerSource === "physical" ? "Fysiek apparaat" : "App"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Laatste positie</dt>
              <dd className="font-mono text-xs text-slate-700">
                {vehicle.latitude != null
                  ? `${vehicle.latitude.toFixed(5)}, ${vehicle.longitude?.toFixed(5)}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Snelheid</dt>
              <dd className="text-slate-700">
                {vehicle.speedKmh != null ? `${vehicle.speedKmh} km/u` : "—"}
              </dd>
            </div>
          </dl>
        </div>

        {/* Gekoppelde hardware-apparaten (US-12) */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-r from-blue-50 via-indigo-50/60 to-transparent px-5 py-4">
            <h2 className="font-semibold text-slate-900">
              Gekoppelde apparaten {vehicle.devices.length > 0 && (
                <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {vehicle.devices.length}
                </span>
              )}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              GPS-hardware die aan dit voertuig is toegewezen. Koppel, vervang of ontkoppel apparaten hieronder.
            </p>
          </div>

          <div className="p-5">
            {vehicle.devices.length === 0 ? (
              <p className="mb-4 text-sm text-slate-400">
                Nog geen hardware-apparaten gekoppeld. Selecteer hieronder een geregistreerd apparaat, of voeg er
                een toe via <a href="/app/devices" className="font-medium text-blue-600 hover:underline">Apparaten</a>.
              </p>
            ) : (
              <ul className="mb-4 space-y-2">
                {vehicle.devices.map((d) => (
                  <li
                    key={d.id}
                    className="group flex flex-col gap-2.5 rounded-lg border border-slate-100 bg-gradient-to-r from-slate-50 to-white px-3.5 py-2.5 transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="relative flex h-2.5 w-2.5 flex-none">
                        {d.connectionState === "online" && (
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                        )}
                        <span
                          className="relative inline-flex h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor:
                              d.connectionState === "online" ? "#16a34a"
                              : d.connectionState === "stale" ? "#d97706"
                              : "#64748b",
                          }}
                        />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">{d.label ?? d.imei}</p>
                        <p className="truncate font-mono text-xs text-slate-400">IMEI {d.imei}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <div className="text-left sm:text-right">
                        <p className="text-xs font-medium"
                           style={{
                             color:
                               d.connectionState === "online" ? "#16a34a"
                               : d.connectionState === "stale" ? "#d97706"
                               : "#64748b",
                           }}>
                          {d.connectionState === "online" ? "Online"
                            : d.connectionState === "stale" ? "Verbinding verouderd"
                            : d.connectionState === "revoked" ? "Ingetrokken"
                            : d.connectionState === "never_connected" ? "Nooit verbonden"
                            : "Offline"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {d.lastSeenAt ? `Laatst ${new Date(d.lastSeenAt).toLocaleString("nl-NL")}` : "Nog geen data"}
                        </p>
                      </div>
                      <button
                        onClick={() => void unlinkDevice(d.id)}
                        disabled={deviceBusy === d.id}
                        className="min-h-[38px] flex-none rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        {deviceBusy === d.id ? "..." : "Ontkoppelen"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Koppel een apparaat (US-06/US-12) */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-blue-200 bg-blue-50/40 px-3.5 py-3">
              <span className="text-sm font-medium text-slate-700">Apparaat koppelen:</span>
              <select
                value={linkDeviceId}
                onChange={(e) => setLinkDeviceId(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
              >
                <option value="">— Selecteer een geregistreerd apparaat —</option>
                {allDevices
                  .filter((d) => d.status !== "revoked" && d.vehicleId !== id)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label ?? d.imei} (IMEI {d.imei})
                      {d.vehicleId ? " — nu aan ander voertuig" : ""}
                    </option>
                  ))}
              </select>
              <button
                onClick={() => void linkDevice()}
                disabled={!linkDeviceId || deviceBusy === linkDeviceId}
                className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:from-blue-700 hover:to-indigo-700 hover:shadow-md disabled:opacity-50"
              >
                {deviceBusy === linkDeviceId ? "Koppelen..." : "Koppelen"}
              </button>
              <span className="w-full text-xs text-slate-500">
                Staat je apparaat er niet bij? Registreer het eerst bij{" "}
                <a href="/app/devices" className="font-medium text-blue-600 hover:underline">Apparaten</a>.
              </span>
            </div>
          </div>
        </div>

        {/* Gekoppelde personen */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-slate-900">
            Gekoppelde personen {vehicle.persons.length > 0 && `(${vehicle.persons.length})`}
          </h2>
          {vehicle.persons.length === 0 ? (
            <p className="text-sm text-slate-400">Geen personen gekoppeld.</p>
          ) : (
            <ul className="mb-3 space-y-2">
              {vehicle.persons.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm text-blue-600">
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{p.name}</p>
                      <p className="text-xs text-slate-400">{p.email ?? p.phone ?? ""}</p>
                    </div>
                  </div>
                  <button onClick={() => void unlinkPerson(p.id)}
                    className="text-xs font-medium text-red-500 hover:text-red-600">
                    Ontkoppelen
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <select value={linkPersonId} onChange={(e) => setLinkPersonId(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-100">
              <option value="">Persoon toevoegen…</option>
              {persons.filter((p) => !vehicle.persons.some((vp) => vp.id === p.id)).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button onClick={linkPerson} disabled={!linkPersonId}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              Koppelen
            </button>
          </div>
        </div>

        {/* Recent events */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-slate-900">Recente events</h2>
          {vehicle.events.length === 0 ? (
            <p className="text-sm text-slate-400">Geen events.</p>
          ) : (
            <ul className="space-y-2">
              {vehicle.events.map((e) => (
                <li key={e.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">{e.ruleName}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      e.severity === "critical" ? "bg-red-50 text-red-600"
                        : e.severity === "warning" ? "bg-amber-50 text-amber-600"
                        : "bg-blue-50 text-blue-600"
                    }`}>
                      {e.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {formatDateTime(e.startTime)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
