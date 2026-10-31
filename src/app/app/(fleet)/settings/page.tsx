"use client";

// Instellingen-pagina: iedereen mag bekijken; alleen admin wijzigt
import { useCallback, useEffect, useState } from "react";

type Settings = {
  timezone: string;
  unitSpeed: string;
  telemetryIntervalS: number;
  offlineThresholdS: number;
  eventRetentionDays: number;
  pointRetentionDays: number;
  notifyInApp: boolean;
  orgName: string;
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [me, setMe] = useState<{ role: string } | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const [meRes, sRes] = await Promise.all([
      fetch("/api/me"),
      fetch("/api/settings"),
    ]);
    if (meRes.ok) setMe(await meRes.json());
    if (sRes.ok) setSettings(await sRes.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!settings) return <div className="p-6 text-slate-400">Laden…</div>;
  const isAdmin = me?.role === "admin";

  async function save() {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-bold">Instellingen</h1>
      <p className="mb-6 text-sm text-slate-400">
        Centrale configuratie voor het platform
        {!isAdmin && " Â· alleen-lezen"}
      </p>

      <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm">
            Organisatienaam
            <input
              value={settings.orgName}
              onChange={(e) => setSettings({ ...settings, orgName: e.target.value })}
              disabled={!isAdmin}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:opacity-50"
            />
          </label>
          <label className="text-sm">
            Tijdzone
            <select
              value={settings.timezone}
              onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
              disabled={!isAdmin}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:opacity-50"
            >
              <option value="Europe/Amsterdam">Europe/Amsterdam</option>
              <option value="UTC">UTC</option>
              <option value="Europe/Brussels">Europe/Brussels</option>
              <option value="Europe/Berlin">Europe/Berlin</option>
            </select>
          </label>
          <label className="text-sm">
            Snelheidseenheid
            <select
              value={settings.unitSpeed}
              onChange={(e) => setSettings({ ...settings, unitSpeed: e.target.value })}
              disabled={!isAdmin}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:opacity-50"
            >
              <option value="kmh">km/u</option>
              <option value="mph">mph</option>
            </select>
          </label>
          <label className="text-sm">
            Telemetry-interval (sec)
            <input
              type="number"
              value={settings.telemetryIntervalS}
              onChange={(e) => setSettings({ ...settings, telemetryIntervalS: Number(e.target.value) })}
              disabled={!isAdmin}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:opacity-50"
            />
          </label>
          <label className="text-sm">
            Offline-drempel (sec)
            <input
              type="number"
              value={settings.offlineThresholdS}
              onChange={(e) => setSettings({ ...settings, offlineThresholdS: Number(e.target.value) })}
              disabled={!isAdmin}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:opacity-50"
            />
          </label>
          <label className="text-sm">
            Event-bewaartermijn (dagen)
            <input
              type="number"
              value={settings.eventRetentionDays}
              onChange={(e) => setSettings({ ...settings, eventRetentionDays: Number(e.target.value) })}
              disabled={!isAdmin}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:opacity-50"
            />
          </label>
          <label className="text-sm">
            GPS-punt-bewaartermijn (dagen)
            <input
              type="number"
              value={settings.pointRetentionDays}
              onChange={(e) => setSettings({ ...settings, pointRetentionDays: Number(e.target.value) })}
              disabled={!isAdmin}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:opacity-50"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.notifyInApp}
              onChange={(e) => setSettings({ ...settings, notifyInApp: e.target.checked })}
              disabled={!isAdmin}
              className="accent-sky-500 disabled:opacity-50"
            />
            In-app notificaties
          </label>
        </div>

        {isAdmin && (
          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={save}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold hover:bg-blue-700"
            >
              Opslaan
            </button>
            {saved && (
              <span className="text-sm text-emerald-400">âœ“ Opgeslagen</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

