"use client";

// Tracker-detailpaneel (Phase 2): algemeen + identiteit + verificatie,
// beheerders-metadata (edit), apparaat-metadata (read-only), hardware-sidecar
// en recente GPS-history. Haalt zijn eigen data op via GET /api/trackers/[id].
import { useCallback, useEffect, useState } from "react";
import { apiRequest, jsonRequest } from "@/lib/http";
import { formatDateTime } from "@/lib/format";
import { ErrorBanner, fieldClass, primaryButtonClass } from "@/components/ui";

export type TrackerHardware = {
  id: string;
  imei: string | null;
  deviceType: string;
  status: string;
  brand: string | null;
  model: string | null;
  protocol: string | null;
  simCardNumber: string | null;
  firmware: string | null;
  label: string | null;
  lastSeenAt: string | null;
  lastRecordCount: number;
};

export type TrackerDetail = {
  id: string;
  name: string;
  displayName: string | null;
  externalId: string | null;
  sourceType: string | null;
  verificationStatus: string | null;
  connectionState: string;
  firstSeenAt: string;
  lastSeen: string;
  latitude: number | null;
  longitude: number | null;
  speedKmh: number | null;
  lastAltitude: number | null;
  lastHeading: number | null;
  lastBatteryLevel: number | null;
  accuracyMeters: number | null;
  metadata: Record<string, unknown> | null;
  deviceMetadata: Record<string, unknown> | null;
  description: string | null;
  licensePlate: string | null;
  brand: string | null;
  vehicleType: string | null;
  trackerSerial: string | null;
  hardware: TrackerHardware | null;
  recentPoints: {
    latitude: number;
    longitude: number;
    speedMps: number | null;
    altitude: number | null;
    heading: number | null;
    accuracyMeters: number | null;
    sampledAt: string;
  }[];
};

type MetaForm = {
  vehicle_type: string;
  vehicle_registration: string;
  company: string;
  driver: string;
  department: string;
  customFields: { key: string; value: string }[];
};

function metaToForm(meta: Record<string, unknown> | null): MetaForm {
  const m = meta ?? {};
  const custom = (m.customFields ?? {}) as Record<string, string>;
  return {
    vehicle_type: typeof m.vehicle_type === "string" ? m.vehicle_type : "",
    vehicle_registration:
      typeof m.vehicle_registration === "string" ? m.vehicle_registration : "",
    company: typeof m.company === "string" ? m.company : "",
    driver: typeof m.driver === "string" ? m.driver : "",
    department: typeof m.department === "string" ? m.department : "",
    customFields: Object.entries(custom).map(([key, value]) => ({ key, value })),
  };
}

function formToMeta(f: MetaForm): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (f.vehicle_type.trim()) out.vehicle_type = f.vehicle_type.trim();
  if (f.vehicle_registration.trim()) out.vehicle_registration = f.vehicle_registration.trim();
  if (f.company.trim()) out.company = f.company.trim();
  if (f.driver.trim()) out.driver = f.driver.trim();
  if (f.department.trim()) out.department = f.department.trim();
  const custom: Record<string, string> = {};
  for (const row of f.customFields) {
    if (row.key.trim() && row.value.trim()) custom[row.key.trim()] = row.value.trim();
  }
  if (Object.keys(custom).length > 0) out.customFields = custom;
  return out;
}

function Badge({ tone, children }: { tone: "green" | "amber" | "red" | "slate" | "blue"; children: React.ReactNode }) {
  const tones = {
    green: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
    slate: "bg-slate-100 text-slate-600",
    blue: "bg-blue-100 text-blue-700",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

const VERIF_TONE: Record<string, "green" | "amber" | "red" | "slate"> = {
  verified: "green",
  unverified: "amber",
  revoked: "red",
};

export default function TrackerDetailPanel({
  trackerId,
  isAdmin,
  onClose,
  onChanged,
}: {
  trackerId: string;
  isAdmin: boolean;
  onClose: () => void;
  /** Called after mutations so the list can refresh. */
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<TrackerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [metaForm, setMetaForm] = useState<MetaForm>(metaToForm(null));
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiRequest<TrackerDetail>(`/api/trackers/${trackerId}`);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDetail(r.data);
      setName(r.data.displayName ?? r.data.name);
      setDescription(r.data.description ?? "");
      setMetaForm(metaToForm(r.data.metadata));
      setError(null);
    } catch {
      setError("Tracker laden mislukt");
    } finally {
      setLoading(false);
    }
  }, [trackerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveGeneral() {
    setSavingGeneral(true);
    try {
      const r = await apiRequest(`/api/trackers/${trackerId}`, {
        ...jsonRequest("PATCH", {
          displayName: name.trim() || undefined,
          description: description.trim() || null,
        }),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setError(null);
      await load();
      onChanged();
    } finally {
      setSavingGeneral(false);
    }
  }

  async function saveMetadata() {
    setSavingMeta(true);
    try {
      const r = await apiRequest(`/api/trackers/${trackerId}`, {
        ...jsonRequest("PATCH", { metadata: formToMeta(metaForm) }),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setError(null);
      await load();
      onChanged();
    } finally {
      setSavingMeta(false);
    }
  }

  async function setVerification(status: "verified" | "revoked") {
    if (
      status === "revoked" &&
      !confirm("Tracker intrekken? Deze stopt met data ontvangen.")
    ) {
      return;
    }
    setActionBusy(true);
    try {
      const r = await apiRequest(`/api/trackers/${trackerId}/${status === "verified" ? "verify" : "revoke"}`, {
        method: "POST",
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setError(null);
      await load();
      onChanged();
    } finally {
      setActionBusy(false);
    }
  }

  async function removeHardware() {
    if (!detail?.hardware || !confirm("Hardware-apparaat verwijderen (soft delete)?")) return;
    setActionBusy(true);
    try {
      const r = await apiRequest(`/api/devices/${detail.hardware.id}`, { method: "DELETE" });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setError(null);
      await load();
      onChanged();
    } finally {
      setActionBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-400">
        Tracker laden…
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6">
        <ErrorBanner>{error ?? "Niet gevonden"}</ErrorBanner>
        <button onClick={onClose} className={primaryButtonClass}>
          Sluiten
        </button>
      </div>
    );
  }

  const devMeta = (detail.deviceMetadata ?? {}) as Record<string, unknown>;
  const devCustom = (devMeta.customFields ?? {}) as Record<string, string>;

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Kop */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xl">{detail.sourceType === "hardware" ? "📡" : "📱"}</span>
            <h2 className="truncate text-lg font-semibold text-slate-900">
              {detail.displayName ?? detail.name}
            </h2>
            <Badge tone={VERIF_TONE[detail.verificationStatus ?? "unverified"] ?? "slate"}>
              {detail.verificationStatus === "verified"
                ? "Geverifieerd"
                : detail.verificationStatus === "revoked"
                  ? "Ingetrokken"
                  : "Ongeverifieerd"}
            </Badge>
            <Badge tone="blue">{detail.sourceType === "hardware" ? "Hardware" : detail.sourceType === "mobile" ? "Mobiel" : "Legacy"}</Badge>
            <Badge tone={detail.connectionState === "online" ? "green" : detail.connectionState === "stale" ? "amber" : "slate"}>
              {detail.connectionState}
            </Badge>
          </div>
          <p className="mt-1 font-mono text-xs text-slate-400">
            {detail.externalId ?? "— geen externe identiteit —"}
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          ✕ Sluiten
        </button>
      </div>

      <div className="space-y-5 p-5">
        <ErrorBanner>{error}</ErrorBanner>

        {/* Verificatie-acties (admin = pairing) */}
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="min-w-0 flex-1 text-sm text-amber-800">
              {detail.verificationStatus === "unverified"
                ? "Deze tracker is automatisch ontdekt. Verifieer hem alleen als je de identiteit (IMEI-label / installatie) fysiek hebt bevestigd."
                : detail.verificationStatus === "revoked"
                  ? "Ingetrokken: deze tracker wordt geweigerd tot je hem opnieuw verifieert."
                  : "Geverifieerd — data van deze identiteit wordt geaccepteerd."}
            </p>
            {detail.verificationStatus !== "verified" && (
              <button
                onClick={() => void setVerification("verified")}
                disabled={actionBusy}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Verifiëren
              </button>
            )}
            {detail.verificationStatus !== "revoked" && (
              <button
                onClick={() => void setVerification("revoked")}
                disabled={actionBusy}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Intrekken
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Algemeen */}
          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Algemeen
            </h3>
            <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div><dt className="text-slate-400">Laatste positie</dt>
                <dd className="font-mono">{detail.latitude != null ? `${detail.latitude.toFixed(5)}, ${detail.longitude?.toFixed(5)}` : "—"}</dd></div>
              <div><dt className="text-slate-400">Snelheid</dt><dd>{detail.speedKmh != null ? `${detail.speedKmh} km/u` : "—"}</dd></div>
              <div><dt className="text-slate-400">Hoogte</dt><dd>{detail.lastAltitude != null ? `${detail.lastAltitude} m` : "—"}</dd></div>
              <div><dt className="text-slate-400">Koers</dt><dd>{detail.lastHeading != null ? `${detail.lastHeading}°` : "—"}</dd></div>
              <div><dt className="text-slate-400">Batterij</dt>
                <dd>{detail.lastBatteryLevel != null ? `${detail.lastBatteryLevel}%` : "—"}</dd></div>
              <div><dt className="text-slate-400">Nauwkeurigheid</dt>
                <dd>{detail.accuracyMeters != null ? `±${Math.round(detail.accuracyMeters)} m` : "—"}</dd></div>
              <div><dt className="text-slate-400">Eerst gezien</dt><dd>{formatDateTime(detail.firstSeenAt)}</dd></div>
              <div><dt className="text-slate-400">Laatst gezien</dt><dd>{formatDateTime(detail.lastSeen)}</dd></div>
            </dl>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-500">Weergavenaam</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={fieldClass}
                maxLength={80}
              />
            </label>
            <label className="mt-2 block text-sm">
              <span className="mb-1 block text-slate-500">Omschrijving (beheerder)</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className={fieldClass}
                placeholder={detail.licensePlate ? `Kenteken: ${detail.licensePlate}` : "Notities…"}
              />
            </label>
            <button
              onClick={() => void saveGeneral()}
              disabled={savingGeneral}
              className={`${primaryButtonClass} mt-3`}
            >
              {savingGeneral ? "Opslaan…" : "Opslaan"}
            </button>
          </section>

          {/* Metadata (beheerder) */}
          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Metadata (beheerder)
            </h3>
            <p className="mb-3 text-xs text-slate-400">
              Wordt nooit overschreven door inkomende tracker-data.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  ["vehicle_registration", "Kenteken"],
                  ["vehicle_type", "Voertuigtype"],
                  ["driver", "Bestuurder"],
                  ["department", "Afdeling"],
                  ["company", "Bedrijf"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-sm">
                  <span className="mb-1 block text-slate-500">{label}</span>
                  <input
                    value={metaForm[key]}
                    onChange={(e) => setMetaForm({ ...metaForm, [key]: e.target.value })}
                    className={fieldClass}
                  />
                </label>
              ))}
            </div>
            <p className="mb-1 mt-3 text-xs font-medium text-slate-500">Eigen velden</p>
            {metaForm.customFields.map((row, i) => (
              <div key={i} className="mb-1.5 flex gap-2">
                <input
                  value={row.key}
                  onChange={(e) => {
                    const next = [...metaForm.customFields];
                    next[i] = { ...next[i], key: e.target.value };
                    setMetaForm({ ...metaForm, customFields: next });
                  }}
                  placeholder="Sleutel"
                  className={`${fieldClass} sm:w-2/5`}
                />
                <input
                  value={row.value}
                  onChange={(e) => {
                    const next = [...metaForm.customFields];
                    next[i] = { ...next[i], value: e.target.value };
                    setMetaForm({ ...metaForm, customFields: next });
                  }}
                  placeholder="Waarde"
                  className={fieldClass}
                />
                <button
                  onClick={() =>
                    setMetaForm({
                      ...metaForm,
                      customFields: metaForm.customFields.filter((_, j) => j !== i),
                    })
                  }
                  className="rounded-lg border border-slate-200 px-3 text-slate-400 hover:border-red-200 hover:text-red-500"
                  aria-label="Veld verwijderen"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                setMetaForm({
                  ...metaForm,
                  customFields: [...metaForm.customFields, { key: "", value: "" }],
                })
              }
              className="mb-3 text-sm text-blue-600 hover:underline"
            >
              + Eigen veld toevoegen
            </button>
            <div>
              <button
                onClick={() => void saveMetadata()}
                disabled={savingMeta}
                className={primaryButtonClass}
              >
                {savingMeta ? "Opslaan…" : "Metadata opslaan"}
              </button>
            </div>
          </section>
        </div>

        {/* Apparaat-metadata (read-only) */}
        {Object.keys(devMeta).length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Apparaat-informatie (gemeld door tracker)
            </h3>
            <p className="mb-2 text-xs text-slate-400">
              Automatisch gesynchroniseerd vanaf het apparaat; alleen-lezen.
            </p>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {Object.entries(devMeta)
                .filter(([k]) => k !== "customFields")
                .map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <dt className="text-slate-400">{k}</dt>
                    <dd className="font-medium text-slate-700">{String(v)}</dd>
                  </div>
                ))}
              {Object.entries(devCustom).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="text-slate-400">{k}</dt>
                  <dd className="font-medium text-slate-700">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* Hardware-sidecar */}
        {detail.hardware && (
          <section className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Hardware
              </h3>
              <button
                onClick={() => void removeHardware()}
                disabled={actionBusy}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Apparaat verwijderen
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <div><dt className="text-slate-400">IMEI</dt><dd className="font-mono">{detail.hardware.imei ?? "—"}</dd></div>
              <div><dt className="text-slate-400">Status</dt><dd>{detail.hardware.status}</dd></div>
              <div><dt className="text-slate-400">Merk/model</dt><dd>{[detail.hardware.brand, detail.hardware.model].filter(Boolean).join(" ") || "—"}</dd></div>
              <div><dt className="text-slate-400">Protocol</dt><dd>{detail.hardware.protocol ?? "—"}</dd></div>
              <div><dt className="text-slate-400">Firmware</dt><dd>{detail.hardware.firmware ?? "—"}</dd></div>
              <div><dt className="text-slate-400">Records totaal</dt><dd>{detail.hardware.lastRecordCount}</dd></div>
              <div><dt className="text-slate-400">SIM</dt><dd className="font-mono">{detail.hardware.simCardNumber ?? "—"}</dd></div>
              <div><dt className="text-slate-400">Label</dt><dd>{detail.hardware.label ?? "—"}</dd></div>
            </dl>
          </section>
        )}

        {/* GPS-history (laatste 100) */}
        <section className="rounded-xl border border-slate-200 p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            GPS-history (laatste {detail.recentPoints.length} punten)
          </h3>
          {detail.recentPoints.length === 0 ? (
            <p className="text-sm text-slate-400">Nog geen GPS-punten ontvangen.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white text-left text-xs text-slate-400">
                  <tr>
                    <th className="px-2 py-1.5">Tijd</th>
                    <th className="px-2 py-1.5">Positie</th>
                    <th className="px-2 py-1.5 text-right">Snelheid</th>
                    <th className="px-2 py-1.5 text-right">Hoogte</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.recentPoints.map((p, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 text-slate-500">{formatDateTime(p.sampledAt)}</td>
                      <td className="px-2 py-1.5 font-mono text-xs">
                        {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {p.speedMps != null ? `${Math.round(p.speedMps * 3.6)} km/u` : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right">{p.altitude != null ? `${Math.round(p.altitude)} m` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
