"use client";

// GPS-hardware apparaten (Teltonika FMC920 e.d.)
// Registreren op IMEI, autoriseren met de Connect-knop, koppelen aan voertuig,
// live verbindingstatus (online/stale/offline) en laatste positie.
import { useCallback, useEffect, useState } from "react";

type Device = {
  id: string;
  imei: string;
  label: string | null;
  brand: string | null;
  model: string | null;
  simCardNumber: string | null;
  firmware: string | null;
  protocol: string | null;
  status: "pending" | "active" | "revoked";
  connectionState: "online" | "stale" | "offline" | "never_connected" | "revoked";
  authorizedAt: string | null;
  vehicleId: string | null;
  vehicleName: string | null;
  vehicleLicensePlate: string | null;
  lastSeenAt: string | null;
  lastLat: number | null;
  lastLon: number | null;
  lastSpeedMps: number | null;
  speedLiveKmh: number | null;
  lastSpeedKmh: number | null;
  lastFixAt: string | null;
  lastRecordCount: number;
  createdAt: string;
};

type VehicleOption = { id: string; displayName: string; licensePlate: string | null };

const STATUS_LABEL: Record<string, string> = {
  pending: "Wacht op goedkeuring",
  active: "Actief",
  revoked: "Ingetrokken",
};

const CONN_LABEL: Record<string, string> = {
  online: "Online",
  stale: "Verbinding verouderd",
  offline: "Offline",
  never_connected: "Nooit verbonden",
  revoked: "Ingetrokken",
};

function connColor(state: string): string {
  switch (state) {
    case "online":
      return "#16a34a";
    case "stale":
      return "#d97706";
    case "offline":
    case "never_connected":
      return "#64748b";
    default:
      return "#dc2626";
  }
}

/* Kleine SVG-iconen voor knoppen (kleurvast, geen emoji) */
function IconPlus({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
function IconPower({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M12 3v8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M6.2 6.2a8 8 0 1 0 11.6 0" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
function IconPowerOff({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M12 3v8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M6.2 6.2a8 8 0 0 0 11.6 11.6M17.8 6.2A8 8 0 0 0 6.2 17.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
function IconTrash({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconBook({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2V5Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
      <path d="M8 7h8M8 11h8M8 15h5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    imei: "",
    label: "",
    brand: "Teltonika",
    model: "",
    simCardNumber: "",
    firmware: "",
    protocol: "codec8e",
    vehicleId: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const load = useCallback(async () => {
    const [dRes, vRes] = await Promise.all([
      fetch("/api/devices"),
      fetch("/api/vehicles"),
    ]);
    if (dRes.ok) {
      const d = await dRes.json();
      setDevices(d.devices);
    }
    if (vRes.ok) {
      const d = await vRes.json();
      setVehicles(
        d.vehicles.map((v: { id: string; displayName: string; licensePlate: string | null }) => ({
          id: v.id,
          displayName: v.displayName,
          licensePlate: v.licensePlate,
        }))
      );
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  async function save() {
    if (!form.imei.trim()) {
      setError("IMEI is verplicht");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imei: form.imei.trim(),
          label: form.label.trim() || null,
          brand: form.brand.trim() || null,
          model: form.model.trim() || null,
          simCardNumber: form.simCardNumber.trim() || null,
          firmware: form.firmware.trim() || null,
          protocol: form.protocol,
          vehicleId: form.vehicleId || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? `Fout ${res.status}`);
        return;
      }
      setShowForm(false);
      setForm({ imei: "", label: "", brand: "Teltonika", model: "", simCardNumber: "", firmware: "", protocol: "codec8e", vehicleId: "" });
      void load();
    } catch {
      setError("Netwerkfout");
    } finally {
      setSaving(false);
    }
  }

  async function action(deviceId: string, body: Record<string, unknown>, okMsg: string) {
    setBusyId(deviceId);
    setError(null);
    try {
      const res = await fetch(`/api/devices/${deviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? `Fout ${res.status}`);
        return;
      }
      void load();
    } catch {
      setError(okMsg + " mislukt: netwerkfout");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(deviceId: string) {
    if (!confirm("Device verwijderen? Het apparaat wordt ingetrokken en verborgen.")) return;
    setBusyId(deviceId);
    try {
      const res = await fetch(`/api/devices/${deviceId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? `Fout ${res.status}`);
        return;
      }
      void load();
    } catch {
      setError("Netwerkfout");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Header met gradient */}
        <div className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 px-4 py-5 shadow-lg sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-white drop-shadow-sm sm:text-2xl">Apparaten</h1>
            <p className="mt-1 text-sm text-blue-100">
              GPS-hardware (bijv. Teltonika FMC920) registreren op IMEI, autoriseren en koppelen aan voertuigen.
            </p>
          </div>
          <div className="flex flex-row flex-wrap items-center gap-2">
            <button
              onClick={() => setShowGuide((v) => !v)}
              className="flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 sm:flex-none"
            >
              <IconBook className="h-4 w-4" />
              {showGuide ? "Handleiding sluiten" : "Installatiehandleiding"}
            </button>
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50 hover:shadow-md sm:flex-none"
            >
              <IconPlus className="h-4 w-4" />
              {showForm ? "Annuleren" : "Apparaat"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {showGuide && (
        <div className="mb-6 overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-lg">
          <div className="border-b border-blue-100 bg-gradient-to-r from-blue-50 via-indigo-50/70 to-blue-50/40 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Installatiehandleiding — GPS-tracker (bijv. Teltonika FMC920)
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Volg deze stappen om een fysiek GPS-apparaat te koppelen aan dit platform.
              Elke stap vertelt waar je de benodigde gegevens uit haalt.
            </p>
          </div>
          <div className="space-y-4 p-5">

          {/* Stap 1 */}
          <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="mb-2 font-semibold text-slate-900">Stap 1 — Verzamel de apparaatgegevens</h3>
            <p className="mb-2 text-sm text-slate-600">
              Je hebt nodig: <strong>IMEI</strong>, <strong>SIM-kaartnummer (ICCID)</strong>, <strong>merk/model</strong> en <strong>firmware</strong>.
              Haal ze als volgt op:
            </p>
            <ul className="ml-4 list-disc space-y-1.5 text-sm text-slate-700">
              <li>
                <strong>IMEI</strong> (15 cijfers, unieke identificatie) — te vinden op:
                <ul className="ml-4 list-circle space-y-0.5 text-slate-600">
                  <li>Het label op het apparaat (onder- of achterkant)</li>
                  <li>
                    <strong>Teltonika Configurator</strong> (USB-verbinding) → tabblad <strong>Status</strong> →
                    &quot;Device Info&quot; → <em>Device IMEI</em>
                  </li>
                  <li>
                    Status-export: <strong>Status</strong> → <em>Export to HTML</em> → regel &quot;Device IMEI&quot;
                  </li>
                  <li>SMS <code className="rounded bg-slate-100 px-1">getinfo</code> naar het apparaat-SIM-nummer → antwoord bevat de IMEI</li>
                </ul>
              </li>
              <li>
                <strong>SIM-kaartnummer (ICCID)</strong> — te vinden op:
                <ul className="ml-4 list-circle space-y-0.5 text-slate-600">
                  <li>De SIM-kaart zelf (19–20 cijfers)</li>
                  <li>Status-export → <em>I/O Info</em> → regel &quot;ICCID&quot;</li>
                </ul>
              </li>
              <li>
                <strong>Merk / Model / Firmware</strong> — Status-export → &quot;Device Name&quot; en
                &quot;Firmware Version&quot; (bijv. <em>FMC920, 04.00.00 Rev:14</em>)
              </li>
            </ul>
          </div>

          {/* Stap 2 */}
          <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="mb-2 font-semibold text-slate-900">Stap 2 — Configureer het apparaat</h3>
            <p className="mb-2 text-sm text-slate-600">
              Het apparaat moet zijn data naar deze server sturen. Gebruik de <strong>Teltonika Configurator</strong>
              (USB) of stuur SMS-commando&apos;s. Stel het volgende in:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
                    <th className="py-1.5 pr-4">Instelling</th>
                    <th className="py-1.5 pr-4">Waarde</th>
                    <th className="py-1.5">Waar in Configurator</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  <tr className="border-b border-slate-100"><td className="py-1.5 pr-4">APN</td><td className="py-1.5 pr-4 font-mono">internet.mobiel</td><td className="py-1.5">GPRS → APN (pas aan naar je SIM-provider)</td></tr>
                  <tr className="border-b border-slate-100"><td className="py-1.5 pr-4">Authenticatie</td><td className="py-1.5 pr-4">Normal (PAP)</td><td className="py-1.5">GPRS → GPRS Authentication</td></tr>
                  <tr className="border-b border-slate-100"><td className="py-1.5 pr-4">Server-domein</td><td className="py-1.5 pr-4 font-mono">bore.pub</td><td className="py-1.5">Server → Domain</td></tr>
                  <tr className="border-b border-slate-100"><td className="py-1.5 pr-4">Server-poort</td><td className="py-1.5 pr-4 font-mono">5556</td><td className="py-1.5">Server → Port</td></tr>
                  <tr className="border-b border-slate-100"><td className="py-1.5 pr-4">Protocol</td><td className="py-1.5 pr-4">TCP, TLS: None</td><td className="py-1.5">Server → Protocol / TLS</td></tr>
                  <tr className="border-b border-slate-100"><td className="py-1.5 pr-4">Data Protocol</td><td className="py-1.5 pr-4">Codec 8 Extended</td><td className="py-1.5">System → Data Protocol</td></tr>
                  <tr><td className="py-1.5 pr-4">ACK Type</td><td className="py-1.5 pr-4">AVL</td><td className="py-1.5">Records → ACK Type</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              <strong>Geen Configurator bij de hand?</strong> Stuur SMS-commando&apos;s naar het apparaat-SIM-nummer
              (let op: <strong>twee spaties</strong> vooraf, geen &quot;set&quot;):
            </p>
            <pre className="mt-1 overflow-x-auto rounded bg-slate-100 p-2 font-mono text-xs text-slate-700">
{`  setparam 2004:bore.pub;2005:5556;2006:0`}
            </pre>
          </div>

          {/* Stap 3 */}
          <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="mb-2 font-semibold text-slate-900">Stap 3 — Registreer en autoriseer het apparaat hier</h3>
            <ol className="ml-4 list-decimal space-y-1.5 text-sm text-slate-700">
              <li>
                Klik op <strong>+ Apparaat</strong> en vul de <strong>IMEI</strong> in (verplicht) plus de overige
                gegevens uit stap 1. Kies bij Protocol <strong>Codec 8 Extended</strong>.
              </li>
              <li>
                Na registreren krijgt het apparaat status <strong>&quot;Wacht op goedkeuring&quot;</strong>.
                Klik op <strong>Connect</strong> om het apparaat te <em>autoriseren</em> — pas dan mag het data
                sturen (IMEI-allowlist).
              </li>
              <li>
                <strong>Koppel het apparaat aan een voertuig</strong> via het keuzemenu. Zonder voertuig-koppeling
                worden posities niet opgeslagen.
              </li>
            </ol>
          </div>

          {/* Stap 4 */}
          <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="mb-2 font-semibold text-slate-900">Stap 4 — Test de verbinding</h3>
            <ol className="ml-4 list-decimal space-y-1.5 text-sm text-slate-700">
              <li>
                Stuur SMS <code className="rounded bg-slate-100 px-1">  getrecord</code> (twee spaties vooraf)
                naar het apparaat — dit stuurt de opgeslagen records onmiddellijk.
              </li>
              <li>
                Of wacht tot het volgende verzendmoment van het apparaat (Data Acquisition-interval).
              </li>
              <li>
                Controleer hier de status: de verbindingstatus wordt <strong>Online</strong> (groen) zodra er een nieuwe batch data
                binnenkomt. De laatste positie verschijnt bij het apparaat én op de kaart bij het gekoppelde voertuig.
              </li>
            </ol>
          </div>

          {/* Statussen */}
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="mb-2 font-semibold text-slate-900">Betekenis van de statussen</h3>
            <ul className="ml-4 list-disc space-y-1 text-sm text-slate-700">
              <li><strong>Wacht op goedkeuring</strong> — geregistreerd, maar nog niet geautoriseerd. Klik Connect.</li>
              <li><strong>Actief</strong> — geautoriseerd; het apparaat mag data sturen.</li>
              <li><strong>Online</strong> (groen) — in de laatste 2 uur actief geweest (nieuwste batch).</li>
              <li><strong>Verbinding verouderd</strong> (oranje) — laatste data 2-6–10 min geleden.</li>
              <li><strong>Offline</strong> (grijs) — langer dan 6 uur geen data.</li>
              <li><strong>Ingetrokken</strong> — geweigerd; mag niet meer verbinden.</li>
            </ul>
          </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 bg-gradient-to-r from-blue-50 via-indigo-50/70 to-transparent px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Nieuw apparaat registreren</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Vul de gegevens in van het GPS-apparaat. De IMEI is verplicht — de overige velden helpen bij beheer.
            </p>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">IMEI *</span>
              <input
                value={form.imei}
                onChange={(e) => setForm({ ...form, imei: e.target.value })}
                placeholder="868618088364708"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Label</span>
              <input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Bijv. Vrachtwagen 1 tracker"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Merk</span>
              <input
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Model</span>
              <input
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="FMC920"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">SIM-kaartnummer</span>
              <input
                value={form.simCardNumber}
                onChange={(e) => setForm({ ...form, simCardNumber: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Protocol</span>
              <select
                value={form.protocol}
                onChange={(e) => setForm({ ...form, protocol: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="codec8e">Codec 8 Extended</option>
                <option value="codec8">Codec 8</option>
                <option value="codec16">Codec 16</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Koppel aan voertuig</span>
              <select
                value={form.vehicleId}
                onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">— Nog geen voertuig —</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.displayName}
                    {v.licensePlate ? ` (${v.licensePlate})` : ""}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-500">
                De auto waarin dit apparaat is bevestigd. Je kunt dit later altijd wijzigen.
              </span>
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => void save()}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Opslaan..." : "Registreren"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Annuleren
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Na registratie krijgt het apparaat status &quot;Wacht op goedkeuring&quot;. Gebruik de
            <strong> Connect</strong>-knop om het apparaat te autoriseren. Weet je niet waar je de IMEI of
            andere gegevens vandaan haalt? Open de <button
              type="button"
              onClick={() => setShowGuide(true)}
              className="text-blue-600 underline"
            >installatiehandleiding</button> bovenaan.
          </p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {devices.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-gradient-to-b from-white to-slate-50 p-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-2xl">
              <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-blue-600">
                <path d="M12 21s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12Z" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </div>
            <p className="text-slate-600">Nog geen apparaten geregistreerd.</p>
            <p className="mt-1 text-sm text-slate-400">
              Klik op <strong>+ Apparaat</strong> om te beginnen, of open de installatiehandleiding.
            </p>
          </div>
        )}
        {devices.map((d) => (
          <div
            key={d.id}
            className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg"
          >
            {/* Statusbalk bovenaan de kaart */}
            <div
              className="h-1"
              style={{
                background:
                  d.connectionState === "online"
                    ? "linear-gradient(90deg, #16a34a, #4ade80)"
                    : d.connectionState === "stale"
                      ? "linear-gradient(90deg, #d97706, #fbbf24)"
                      : "linear-gradient(90deg, #cbd5e1, #e2e8f0)",
              }}
            />
            <div className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    {d.connectionState === "online" && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ backgroundColor: connColor(d.connectionState) }} />
                    )}
                    <span
                      className="relative inline-flex h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: connColor(d.connectionState) }}
                      aria-hidden
                    />
                  </span>
                  <h3 className="truncate text-base font-semibold text-slate-900">
                    {d.label ?? d.imei}
                  </h3>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                    style={{
                      background: d.status === "active" ? "linear-gradient(135deg, #dcfce7, #bbf7d0)" : d.status === "revoked" ? "linear-gradient(135deg, #fee2e2, #fecaca)" : "linear-gradient(135deg, #e0e7ff, #c7d2fe)",
                      color: d.status === "active" ? "#166534" : d.status === "revoked" ? "#991b1b" : "#3730a3",
                    }}
                  >
                    {STATUS_LABEL[d.status] ?? d.status}
                  </span>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                    style={{
                      background: d.connectionState === "online" ? "linear-gradient(135deg, #dcfce7, #bbf7d0)" : d.connectionState === "stale" ? "linear-gradient(135deg, #fef3c7, #fde68a)" : "linear-gradient(135deg, #f1f5f9, #e2e8f0)",
                      color: d.connectionState === "online" ? "#166534" : d.connectionState === "stale" ? "#92400e" : "#475569",
                    }}
                  >
                    {CONN_LABEL[d.connectionState] ?? d.connectionState}
                  </span>
                </div>
                <div className="mt-1 space-y-0.5 text-sm text-slate-600">
                  <p>
                    <span className="text-slate-400">IMEI:</span> {d.imei}
                    {d.model ? <> · <span className="text-slate-400">Model:</span> {d.model}</> : null}
                    {d.brand ? <> · <span className="text-slate-400">Merk:</span> {d.brand}</> : null}
                  </p>
                  <p>
                    <span className="text-slate-400">Voertuig:</span>{" "}
                    {d.vehicleName ? (
                      <>
                        {d.vehicleName}
                        {d.vehicleLicensePlate ? ` (${d.vehicleLicensePlate})` : ""}
                      </>
                    ) : (
                      <span className="italic text-slate-400">niet gekoppeld</span>
                    )}
                  </p>
                  <p>
                    <span className="text-slate-400">Laatst gezien:</span>{" "}
                    {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString("nl-NL") : "—"}
                    {d.lastFixAt ? (
                      <> · <span className="text-slate-400">Fix:</span> {new Date(d.lastFixAt).toLocaleString("nl-NL")}</>
                    ) : null}
                  </p>
                  {d.lastLat !== null && d.lastLon !== null && (
                    <p>
                      <span className="text-slate-400">Positie:</span>{" "}
                      {d.lastLat.toFixed(5)}, {d.lastLon.toFixed(5)}
                      {d.speedLiveKmh !== null
                        ? ` · ${d.speedLiveKmh.toFixed(0)} km/h`
                        : d.lastSpeedKmh !== null
                          ? ` · laatst bekend ${d.lastSpeedKmh.toFixed(0)} km/h`
                          : ""}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                {d.status === "pending" && (
                  <button
                    onClick={() => void action(d.id, { action: "connect" }, "Connect")}
                    disabled={busyId === d.id}
                    className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-emerald-600 hover:to-green-700 hover:shadow-md disabled:opacity-50 sm:flex-none"
                  >
                    <IconPower className="h-4 w-4" />
                    {busyId === d.id ? "..." : "Connect"}
                  </button>
                )}
                {d.status === "active" && (
                  <button
                    onClick={() => void action(d.id, { action: "disconnect" }, "Disconnect")}
                    disabled={busyId === d.id}
                    className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-3.5 py-2 text-sm font-semibold text-amber-700 transition hover:from-amber-100 hover:to-orange-100 disabled:opacity-50 sm:flex-none"
                  >
                    <IconPowerOff className="h-4 w-4" />
                    {busyId === d.id ? "..." : "Verbinding verbreken"}
                  </button>
                )}
                {d.status === "revoked" && (
                  <button
                    onClick={() => void action(d.id, { action: "connect" }, "Heractiveren")}
                    disabled={busyId === d.id}
                    className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-emerald-600 hover:to-green-700 hover:shadow-md disabled:opacity-50 sm:flex-none"
                  >
                    <IconPower className="h-4 w-4" />
                    {busyId === d.id ? "..." : "Opnieuw activeren"}
                  </button>
                )}

                <select
                  value={d.vehicleId ?? ""}
                  onChange={(e) =>
                    void action(d.id, { action: "assign", vehicleId: e.target.value || null }, "Toewijzen")
                  }
                  disabled={busyId === d.id}
                  className="min-h-[40px] flex-1 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm transition hover:border-blue-300 sm:flex-none"
                >
                  <option value="">Geen voertuig</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.displayName}
                      {v.licensePlate ? ` (${v.licensePlate})` : ""}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => void remove(d.id)}
                  disabled={busyId === d.id}
                  className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:opacity-50 sm:flex-none"
                >
                  <IconTrash className="h-4 w-4" />
                  Verwijderen
                </button>
              </div>
            </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
