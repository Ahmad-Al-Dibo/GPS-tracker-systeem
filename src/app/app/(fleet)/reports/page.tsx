"use client";

// Rapporten-pagina — professioneel exportcentrum
// Datum-presets, rapportkeuze met statistieken, datavoorbeeld en CSV-export.
import { useCallback, useEffect, useState } from "react";

type ReportType = {
  type: string;
  title: string;
  desc: string;
  icon: string;
};

const REPORT_TYPES: ReportType[] = [
  {
    type: "events",
    title: "Regel-overtredingen",
    desc: "Alle events met voertuig, regel, ernst, tijdstip en gemeten waarde.",
    icon: "🚨",
  },
  {
    type: "activity",
    title: "Voertuigactiviteit",
    desc: "Laatste positie, snelheid en status van elk voertuig.",
    icon: "🚗",
  },
  {
    type: "availability",
    title: "Tracker-beschikbaarheid",
    desc: "Laatst gezien, leeftijd en aantal GPS-punten per voertuig.",
    icon: "📡",
  },
  {
    type: "distances",
    title: "Kilometerstanden",
    desc: "Startstand, huidige km-stand en totaal gereden afstand per voertuig.",
    icon: "🧭",
  },
  {
    type: "tasks",
    title: "Takenoverzicht",
    desc: "Status, prioriteit, toewijzing, vervaldatum en te-laat-indicatie.",
    icon: "📋",
  },
];

type Preview = {
  type: string;
  title: string;
  columns: string[];
  total: number;
  from: string | null;
  to: string | null;
  generatedAt: string;
  rows: Record<string, string | number | null>[];
  truncated: boolean;
};

const PRESETS = [
  { key: "today", label: "Vandaag" },
  { key: "7d", label: "7 dagen" },
  { key: "30d", label: "30 dagen" },
  { key: "month", label: "Deze maand" },
  { key: "all", label: "Alles" },
] as const;

function presetRange(key: string): { from: string; to: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  switch (key) {
    case "today":
      return { from: iso(now), to: iso(now) };
    case "7d":
      return { from: iso(new Date(now.getTime() - 7 * 86400_000)), to: iso(now) };
    case "30d":
      return { from: iso(new Date(now.getTime() - 30 * 86400_000)), to: iso(now) };
    case "month":
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: iso(now),
      };
    default:
      return { from: "", to: "" };
  }
}

export default function ReportsPage() {
  const [type, setType] = useState("events");
  const [preset, setPreset] = useState<string>("30d");
  const [from, setFrom] = useState(presetRange("30d").from);
  const [to, setTo] = useState(presetRange("30d").to);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ type, format: "json" });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/reports?${params}`);
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? `Fout ${res.status}`);
        setPreview(null);
        return;
      }
      setPreview(await res.json());
    } catch {
      setError("Netwerkfout");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [type, from, to]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  function applyPreset(key: string) {
    setPreset(key);
    const r = presetRange(key);
    setFrom(r.from);
    setTo(r.to);
  }

  async function download() {
    setDownloading(true);
    try {
      const params = new URLSearchParams({ type });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/reports?${params}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `rapport-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setDownloading(false);
    }
  }

  const activeReport = REPORT_TYPES.find((r) => r.type === type);

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold lg:text-2xl">Rapporten</h1>
        <p className="text-sm text-slate-500">
          Genereer en exporteer rapportages als CSV — met voorbeeld op het scherm
        </p>
      </div>

      {/* Datumperiode */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-medium text-slate-700">Periode</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => applyPreset(p.key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  preset === p.key
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <label className="text-sm text-slate-600">
              Van
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setPreset("custom");
                  setFrom(e.target.value);
                }}
                className="ml-2 block rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
              />
            </label>
            <label className="text-sm text-slate-600">
              Tot
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setPreset("custom");
                  setTo(e.target.value);
                }}
                className="ml-2 block rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Rapporttype-keuze */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {REPORT_TYPES.map((r) => (
          <button
            key={r.type}
            onClick={() => setType(r.type)}
            className={`rounded-xl border p-4 text-left transition-colors ${
              type === r.type
                ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <div className="mb-1.5 text-2xl">{r.icon}</div>
            <h3 className="text-sm font-semibold text-slate-900">{r.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{r.desc}</p>
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
      )}

      {/* Statistieken + actie */}
      {preview && (
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <div>
              <p className="text-xs text-slate-400">Rapport</p>
              <p className="text-sm font-semibold text-slate-900">
                {preview.title}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Regels</p>
              <p className="text-sm font-semibold text-slate-900">
                {loading ? "…" : preview.total}
                {preview.truncated && (
                  <span className="ml-1 text-xs font-normal text-slate-400">
                    (voorbeeld toont eerste 200)
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Periode</p>
              <p className="text-sm font-medium text-slate-700">
                {preview.from && preview.to
                  ? `${new Date(preview.from).toLocaleDateString("nl-NL")} – ${new Date(preview.to).toLocaleDateString("nl-NL")}`
                  : "Alle data"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Gegenereerd</p>
              <p className="text-sm font-medium text-slate-700">
                {new Date(preview.generatedAt).toLocaleTimeString("nl-NL")}
              </p>
            </div>
          </div>
          <button
            onClick={() => void download()}
            disabled={downloading || loading}
            className="shrink-0 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {downloading ? "Bezig…" : "⬇ CSV downloaden"}
          </button>
        </div>
      )}

      {/* Voorbeeldtabel */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Voorbeeld — {activeReport?.title ?? type}
          </h2>
        </div>
        <div className="overflow-x-auto">
          {preview && preview.rows.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr>
                  {preview.columns.map((c) => (
                    <th key={c} className="whitespace-nowrap px-4 py-2.5">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    {preview.columns.map((c) => (
                      <td key={c} className="whitespace-nowrap px-4 py-2 text-slate-700">
                        {row[c] === null || row[c] === "" ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          String(row[c])
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p-10 text-center text-sm text-slate-400">
              {loading
                ? "Laden…"
                : "Geen data voor deze selectie. Pas de periode of rapport aan."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
