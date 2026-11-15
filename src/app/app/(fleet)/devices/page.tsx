"use client";

// Trackers-pagina (Phase 2) — EÉN uniforme lijst voor hardware (Teltonika) en
// mobiele trackers. Nieuwe trackers worden automatisch geregistreerd bij
// binnenkomende data; deze pagina toont, zoekt, filtert en beheert ze.
// Handmatig apparaat toevoegen blijft optioneel (guide + formulier).
import { useCallback, useEffect, useMemo, useState } from "react";
import TrackerDetailPanel from "@/components/trackers/tracker-detail";
import { ErrorBanner, fieldClass, primaryButtonClass } from "@/components/ui";
import { apiRequest, jsonRequest } from "@/lib/http";
import { formatDateTime } from "@/lib/format";

type TrackerRow = {
  id: string;
  name: string;
  displayName: string | null;
  externalId: string | null;
  sourceType: string | null;
  verificationStatus: string | null;
  connectionState: string;
  lastSeen: string;
  firstSeenAt: string;
  latitude: number | null;
  longitude: number | null;
  speedKmh: number | null;
  metadata: Record<string, unknown> | null;
  deviceMetadata: Record<string, unknown> | null;
  licensePlate: string | null;
  description: string | null;
  iconEmoji: string | null;
  hardware: { imei: string | null; status: string; brand: string | null; model: string | null } | null;
};

const CONN_TONE: Record<string, string> = {
  online: "#16a34a",
  stale: "#d97706",
  offline: "#94a3b8",
  unknown: "#cbd5e1",
  revoked: "#dc2626",
};

const CONN_LABEL: Record<string, string> = {
  online: "Online",
  stale: "Verouderd",
  offline: "Offline",
  unknown: "Nog geen data",
  revoked: "Ingetrokken",
};

const VERIF_LABEL: Record<string, string> = {
  verified: "Geverifieerd",
  unverified: "Ongeverifieerd",
  revoked: "Ingetrokken",
};

const VERIF_CLASS: Record<string, string> = {
  verified: "bg-emerald-100 text-emerald-700",
  unverified: "bg-amber-100 text-amber-700",
  revoked: "bg-red-100 text-red-700",
};

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "zojuist";
  if (s < 3600) return `${Math.floor(s / 60)} min geleden`;
  if (s < 86400) return `${Math.floor(s / 3600)} u geleden`;
  return `${Math.floor(s / 86400)} d geleden`;
}

export default function TrackersPage() {
  const [trackers, setTrackers] = useState<TrackerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Zoek/filter (server-side)
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sourceType, setSourceType] = useState("all");
  const [verification, setVerification] = useState("all");
  const [connection, setConnection] = useState("all");

  // Panels
  const [showGuide, setShowGuide] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [appDownloadUrl, setAppDownloadUrl] = useState<string | null>(null);

  // Handmatig apparaat-formulier (optioneel; auto-registratie is de default)
  const [vehicles, setVehicles] = useState<{ id: string; displayName: string; licensePlate: string | null }[]>([]);
  const [form, setForm] = useState({
    imei: "",
    label: "",
    brand: "",
    model: "",
    simCardNumber: "",
    protocol: "codec8e",
    vehicleId: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(
    async (offset = 0) => {
      try {
        const params = new URLSearchParams({ limit: "50", offset: String(offset) });
        if (debouncedQuery) params.set("q", debouncedQuery);
        if (sourceType !== "all") params.set("sourceType", sourceType);
        if (verification !== "all") params.set("verificationStatus", verification);
        if (connection !== "all") params.set("connection", connection);
        const r = await apiRequest<{
          trackers: TrackerRow[];
          total: number;
          hasMore: boolean;
        }>(`/api/trackers?${params}`);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setTrackers((prev) => (offset === 0 ? r.data.trackers : [...prev, ...r.data.trackers]));
        setTotal(r.data.total);
        setHasMore(r.data.hasMore);
        setError(null);
      } catch {
        setError("Trackers laden mislukt");
      } finally {
        setLoading(false);
      }
    },
    [debouncedQuery, sourceType, verification, connection]
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  // Laatste-activiteit relatief houden + achtergrond-refresh
  useEffect(() => {
    const t = setInterval(() => void load(0), 30_000);
    return () => clearInterval(t);
  }, [load]);

  // Rol + installatie-URL
  useEffect(() => {
    void (async () => {
      const [me, settings] = await Promise.all([
        apiRequest<{ role: string }>("/api/me"),
        apiRequest<{ appDownloadUrl: string | null }>("/api/settings"),
      ]);
      if (me.ok) setIsAdmin(me.data.role === "admin");
      if (settings.ok) setAppDownloadUrl(settings.data.appDownloadUrl);
    })();
  }, []);

  const loadVehiclesForForm = useCallback(async () => {
    const r = await apiRequest<{ vehicles: { id: string; displayName: string; licensePlate: string | null }[] }>(
      "/api/vehicles"
    );
    if (r.ok) setVehicles(r.data.vehicles);
  }, []);

  async function saveDevice() {
    if (!form.imei.trim()) {
      setError("IMEI is verplicht");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await apiRequest("/api/devices", {
        ...jsonRequest("POST", {
          imei: form.imei.trim(),
          label: form.label.trim() || null,
          brand: form.brand.trim() || null,
          model: form.model.trim() || null,
          simCardNumber: form.simCardNumber.trim() || null,
          protocol: form.protocol,
          vehicleId: form.vehicleId || null,
        }),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setShowForm(false);
      setForm({ imei: "", label: "", brand: "", model: "", simCardNumber: "", protocol: "codec8e", vehicleId: "" });
      void load(0);
    } finally {
      setSaving(false);
    }
  }

  const filtersActive =
    debouncedQuery !== "" || sourceType !== "all" || verification !== "all" || connection !== "all";

  const unverifiedCount = useMemo(
    () => trackers.filter((t) => t.verificationStatus === "unverified").length,
    [trackers]
  );

  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="mb-5 overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 px-4 py-5 shadow-lg sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-white drop-shadow-sm sm:text-2xl">Trackers</h1>
            <p className="mt-1 text-sm text-blue-100">
              {total} tracker{total === 1 ? "" : "s"} · hardware én mobiel · nieuwe trackers
              registreren zichzelf automatisch bij binnenkomende data.
            </p>
          </div>
          <div className="flex flex-row flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setShowInstall((v) => !v);
                if (!showInstall) void loadVehiclesForForm();
              }}
              className="flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 sm:flex-none"
            >
              📱 {showInstall ? "Sluiten" : "App installeren"}
            </button>
            <button
              onClick={() => setShowGuide((v) => !v)}
              className="flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 sm:flex-none"
            >
              📘 {showGuide ? "Handleiding sluiten" : "Installatiehandleiding"}
            </button>
            <button
              onClick={() => {
                setShowForm((v) => !v);
                if (!showForm) void loadVehiclesForForm();
              }}
              className="flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50 hover:shadow-md sm:flex-none"
            >
              + Handmatig apparaat
            </button>
          </div>
        </div>
      </div>

      <ErrorBanner>{error}</ErrorBanner>

      {/* ── Installatiepaneel (mobiele app) ── */}
      {showInstall && (
        <div className="mb-6 overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-lg">
          <div className="border-b border-blue-100 bg-gradient-to-r from-blue-50 via-indigo-50/70 to-blue-50/40 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Mobiele tracker-app installeren</h2>
            <p className="mt-0.5 text-sm text-slate-600">
              De app tovert je telefoon om in een GPS-tracker: naam en metadata instellen,
              tracking aanzetten — de tracker verschijnt automatisch hier.
            </p>
          </div>
          <div className="space-y-4 p-5 text-sm text-slate-700">
            <ol className="ml-5 list-decimal space-y-2">
              <li>
                <strong>Download de app.</strong>{" "}
                {appDownloadUrl ? (
                  <a
                    href={appDownloadUrl}
                    className="font-semibold text-blue-600 underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    APK downloaden
                  </a>
                ) : isAdmin ? (
                  <span className="text-amber-700">
                    Download-URL nog niet ingesteld — zet deze in{" "}
                    <a href="/app/settings" className="underline">
                      Instellingen
                    </a>{" "}
                    (appDownloadUrl). Er wordt geen fictieve link getoond zolang die leeg is.
                  </span>
                ) : (
                  <span className="text-slate-400">nog niet beschikbaar.</span>
                )}
              </li>
              <li>
                <strong>Installeer de APK</strong> op de telefoon (staat installeren vanuit
                onbekende bronbronnen toe wanneer Android dat vraagt).
              </li>
              <li>
                <strong>Open de app → tab Tracker.</strong> Vul de <strong>tracker-naam</strong> in
                (bijv. “Company Van 01”) en eventuele <strong>metadata</strong> (kenteken,
                bestuurder, bedrijf, afdeling, eigen velden).
              </li>
              <li>
                <strong>Koppel met het platform:</strong> de app heeft je{" "}
                <a href="/app/apikeys" className="text-blue-600 underline">
                  API-key
                </a>{" "}
                nodig (tab API’s → server-URL van dit platform + API-key). Bij “Registreren”
                maakt het platform automatisch een tracker aan en krijgt de app een unieke
                tracker-key — die authenticáát daarna elke GPS-zending.
              </li>
              <li>
                <strong>Tracking activeren</strong> en de <strong>locatietoegang</strong> toestaan
                (ook op de achtergrond voor continue tracking; Android kan batterijoptimalisatie
                beperkingen opleggen — de app toont de actuele status).
              </li>
            </ol>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
              <strong className="text-slate-600">Wat de app verstuurt:</strong> lat/lon, tijdstempel,
              snelheid, hoogte, koers, nauwkeurigheid, batterij en — alleen bij wijziging —
              naam/metadata. Offline worden punten lokaal gebufferd en na herverbinding gesynchroniseerd.
            </div>
          </div>
        </div>
      )}

      {/* ── Handmatig apparaat (optioneel) ── */}
      {showForm && (
        <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 bg-gradient-to-r from-blue-50 via-indigo-50/70 to-transparent px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Handmatig apparaat registreren (optioneel)</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Normaal gesproken NIET nodig: een nieuwe FMC920 registreert zichzelf bij zijn eerste
              data-zending. Gebruik dit formulier alleen om IMEI-gegevens vóór in te vullen of een
              apparaat meteen aan een bestaand voertuig te koppelen.
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
                  className={fieldClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Label</span>
                <input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Bijv. Vrachtwagen 1 tracker"
                  className={fieldClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Merk</span>
                <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className={fieldClass} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Model</span>
                <input
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  placeholder="FMC920"
                  className={fieldClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">SIM-kaartnummer</span>
                <input
                  value={form.simCardNumber}
                  onChange={(e) => setForm({ ...form, simCardNumber: e.target.value })}
                  className={fieldClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Protocol</span>
                <select value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value })} className={fieldClass}>
                  <option value="codec8e">Codec 8 Extended</option>
                  <option value="codec8">Codec 8</option>
                  <option value="codec16">Codec 16</option>
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">Koppel aan bestaand voertuig</span>
                <select
                  value={form.vehicleId}
                  onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}
                  className={fieldClass}
                >
                  <option value="">— Nieuwe eigen tracker aanmaken —</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.displayName}
                      {v.licensePlate ? ` (${v.licensePlate})` : ""}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-slate-500">
                  Zonder keuze maakt het apparaat bij eerste data automatisch zijn eigen tracker-record.
                </span>
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => void saveDevice()} disabled={saving} className={primaryButtonClass}>
                {saving ? "Opslaan…" : "Registreren"}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Annuleren
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hardware-installatieguide ── */}
      {showGuide && (
        <div className="mb-6 overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-lg">
          <div className="border-b border-blue-100 bg-gradient-to-r from-blue-50 via-indigo-50/70 to-blue-50/40 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Installatiehandleiding — GPS-tracker (bijv. Teltonika FMC920)
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Het apparaat registreert zichzelf automatisch zodra het voor het eerst data stuurt.
              Jij hoeft alleen de verbinding te configureren en de tracker daarna te verifiëren.
            </p>
          </div>
          <div className="space-y-4 p-5">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="mb-2 font-semibold text-slate-900">Stap 1 — Verzamel de apparaatgegevens</h3>
              <p className="mb-2 text-sm text-slate-600">
                Je hebt nodig: <strong>IMEI</strong>, <strong>SIM-kaartnummer (ICCID)</strong>,
                <strong>merk/model</strong> en <strong>firmware</strong>:
              </p>
              <ul className="ml-4 list-disc space-y-1.5 text-sm text-slate-700">
                <li>
                  <strong>IMEI</strong> (15 cijfers) — label op het apparaat, Teltonika Configurator
                  → Status → Device Info, of SMS <code className="rounded bg-slate-100 px-1">getinfo</code>.
                </li>
                <li>
                  <strong>SIM (ICCID)</strong> — SIM-kaart (19–20 cijfers) of Status-export → I/O Info.
                </li>
                <li>
                  <strong>Merk/Model/Firmware</strong> — Status-export → Device Name / Firmware Version.
                </li>
              </ul>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="mb-2 font-semibold text-slate-900">Stap 2 — Configureer het apparaat</h3>
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
                    <tr className="border-b border-slate-100"><td className="py-1.5 pr-4">APN</td><td className="py-1.5 pr-4 font-mono">internet.mobiel</td><td className="py-1.5">GPRS → APN (naar je provider)</td></tr>
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
                <strong>Geen Configurator?</strong> SMS (twee spaties vooraf, geen &quot;set&quot;):
              </p>
              <pre className="mt-1 overflow-x-auto rounded bg-slate-100 p-2 font-mono text-xs text-slate-700">
{`  setparam 2004:bore.pub;2005:5556;2006:0`}
              </pre>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="mb-2 font-semibold text-slate-900">Stap 3 — Verbinden en verifiëren</h3>
              <ol className="ml-4 list-decimal space-y-1.5 text-sm text-slate-700">
                <li>
                  Stuur SMS <code className="rounded bg-slate-100 px-1">  getrecord</code> of wacht op
                  het volgende verzendmoment — de eerste data zorgt dat de tracker{" "}
                  <strong>automatisch hier verschijnt</strong> (status: Ongeverifieerd).
                </li>
                <li>
                  Controleer of de IMEI op het label overeenkomt met de tracker die is verschenen en
                  klik dan op <strong>Verifiëren</strong> (alleen admins). Geverifieerde trackers
                  hebben voorrang; intrekken blokkeert de datastroom direct.
                </li>
              </ol>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="mb-2 font-semibold text-slate-900">Statussen</h3>
              <ul className="ml-4 list-disc space-y-1 text-sm text-slate-700">
                <li><strong>Ongeverifieerd</strong> — automatisch ontdekt; wacht op admin-pairing.</li>
                <li><strong>Geverifieerd</strong> — identiteit bevestigd; data wordt geaccepteerd.</li>
                <li><strong>Ingetrokken</strong> — geblokkeerd (hardware én mobiel).</li>
                <li><strong>Online</strong> (groen) — recent actief; <strong>Verouderd</strong> (oranje) — minder vers; <strong>Offline</strong> (grijs) — lang stil.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── Zoeken + filters ── */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zoek op naam, IMEI/install-ID, kenteken, bestuurder…"
          aria-label="Tracker zoeken"
          className={`${fieldClass} sm:max-w-sm`}
        />
        <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className={`${fieldClass} sm:w-auto`}>
          <option value="all">Alle bronnen</option>
          <option value="hardware">Hardware</option>
          <option value="mobile">Mobiel</option>
          <option value="legacy">Legacy</option>
        </select>
        <select value={verification} onChange={(e) => setVerification(e.target.value)} className={`${fieldClass} sm:w-auto`}>
          <option value="all">Alle verificaties</option>
          <option value="unverified">Ongeverifieerd</option>
          <option value="verified">Geverifieerd</option>
          <option value="revoked">Ingetrokken</option>
        </select>
        <select value={connection} onChange={(e) => setConnection(e.target.value)} className={`${fieldClass} sm:w-auto`}>
          <option value="all">Alle verbindingen</option>
          <option value="online">Online</option>
          <option value="stale">Verouderd</option>
          <option value="offline">Offline</option>
        </select>
        {filtersActive && (
          <button
            onClick={() => {
              setQuery("");
              setSourceType("all");
              setVerification("all");
              setConnection("all");
            }}
            className="text-sm text-blue-600 hover:underline"
          >
            Wissen
          </button>
        )}
        <span className="ml-auto text-sm text-slate-400">
          {loading && trackers.length === 0 ? "Laden…" : `${trackers.length} van ${total}`}
        </span>
      </div>

      {unverifiedCount > 0 && isAdmin && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {unverifiedCount} nieuwe tracker{unverifiedCount === 1 ? "" : "s"} wacht(en) op verificatie —
          open de tracker om de identiteit te bevestigen.
        </p>
      )}

      {/* ── Detailpaneel ── */}
      {selectedId && (
        <TrackerDetailPanel
          trackerId={selectedId}
          isAdmin={isAdmin}
          onClose={() => setSelectedId(null)}
          onChanged={() => void load(0)}
        />
      )}

      {/* ── Lijst (cards; werkt op mobiel én desktop) ── */}
      <div className="space-y-3">
        {loading && trackers.length === 0 && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        )}

        {!loading && trackers.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-gradient-to-b from-white to-slate-50 p-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-2xl">📡</div>
            <p className="text-slate-600">
              {filtersActive ? "Geen trackers gevonden met deze filters." : "Nog geen trackers."}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {filtersActive
                ? "Pas de zoekopdracht of filters aan."
                : "Stuur data vanaf een app of FMC920 — ze verschijnen hier automatisch. Of open de installatiehandleiding."}
            </p>
          </div>
        )}

        {trackers.map((t) => (
          <button
            key={t.id}
            onClick={() => setSelectedId(t.id)}
            className="group block w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            <div
              className="h-1"
              style={{
                background:
                  t.connectionState === "online"
                    ? "linear-gradient(90deg, #16a34a, #4ade80)"
                    : t.connectionState === "stale"
                      ? "linear-gradient(90deg, #d97706, #fbbf24)"
                      : "linear-gradient(90deg, #cbd5e1, #e2e8f0)",
              }}
            />
            <div className="flex flex-wrap items-start gap-3 p-4">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 text-xl">
                {t.sourceType === "hardware" ? "📡" : t.iconEmoji ?? "📱"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    {t.connectionState === "online" && (
                      <span
                        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                        style={{ backgroundColor: CONN_TONE[t.connectionState] }}
                      />
                    )}
                    <span
                      className="relative inline-flex h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: CONN_TONE[t.connectionState] ?? "#cbd5e1" }}
                      aria-hidden
                    />
                  </span>
                  <h3 className="truncate text-base font-semibold text-slate-900">
                    {t.displayName ?? t.name}
                  </h3>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${VERIF_CLASS[t.verificationStatus ?? "unverified"] ?? "bg-slate-100 text-slate-600"}`}>
                    {VERIF_LABEL[t.verificationStatus ?? "unverified"] ?? t.verificationStatus}
                  </span>
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    {t.sourceType === "hardware" ? "Hardware" : t.sourceType === "mobile" ? "Mobiel" : "Legacy"}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                    {CONN_LABEL[t.connectionState] ?? t.connectionState}
                  </span>
                </div>
                <div className="mt-1 space-y-0.5 text-sm text-slate-600">
                  <p className="truncate font-mono text-xs text-slate-400">
                    {t.externalId ?? "—"}
                    {t.licensePlate ? ` · ${t.licensePlate}` : ""}
                  </p>
                  <p>
                    Laatst gezien: <span title={formatDateTime(t.lastSeen)}>{timeAgo(t.lastSeen)}</span>
                    {t.latitude != null && (
                      <>
                        {" · "}
                        <span className="font-mono text-xs">
                          {t.latitude.toFixed(4)}, {t.longitude?.toFixed(4)}
                        </span>
                        {t.speedKmh != null ? ` · ${t.speedKmh} km/u` : ""}
                      </>
                    )}
                  </p>
                </div>
              </div>
              <span className="hidden flex-none self-center rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500 transition group-hover:border-blue-300 group-hover:text-blue-600 sm:block">
                Details →
              </span>
            </div>
          </button>
        ))}

        {hasMore && (
          <button
            onClick={() => void load(trackers.length)}
            className="w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600"
          >
            Meer trackers laden…
          </button>
        )}
      </div>
    </div>
  );
}
