"use client";

// Alerts & Events-pagina
import { useCallback, useEffect, useState } from "react";

type EventRow = {
  id: string;
  vehicle: { name: string; displayName: string | null; iconEmoji: string };
  rule: { name: string };
  severity: string;
  status: string;
  startTime: string;
  endTime: string | null;
  measuredValue: number | null;
  threshold: number | null;
  latitude: number | null;
  longitude: number | null;
  durationSec: number | null;
  assignee: { username: string } | null;
};

export default function AlertsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [selected, setSelected] = useState<EventRow | null>(null);
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (severityFilter) params.set("severity", severityFilter);
    const res = await fetch(`/api/events?${params}&limit=100`);
    if (res.ok) {
      const d = await res.json();
      setEvents(d.events);
      setTotal(d.total);
    }
  }, [statusFilter, severityFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateEvent(id: string, data: Record<string, unknown>) {
    await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    void load();
    setSelected(null);
  }

  const sevColor: Record<string, string> = {
    info: "bg-sky-500/20 text-blue-600",
    warning: "bg-amber-50 text-amber-700",
    critical: "bg-red-50 text-red-600",
  };
  const statusColor: Record<string, string> = {
    new: "bg-red-50 text-red-600",
    under_review: "bg-amber-50 text-amber-700",
    resolved: "bg-green-50 text-green-700",
    dismissed: "bg-slate-100 text-slate-500",
  };

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Alerts & Events</h1>
          <p className="text-sm text-slate-400">{total} events totaal</p>
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Alle statussen</option>
            <option value="new">Nieuw</option>
            <option value="under_review">In beoordeling</option>
            <option value="resolved">Opgelost</option>
            <option value="dismissed">Afgewezen</option>
          </select>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Alle ernst</option>
            <option value="info">Info</option>
            <option value="warning">Waarschuwing</option>
            <option value="critical">Kritiek</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-white text-left text-xs text-slate-400">
            <tr>
              <th className="px-4 py-3">Voertuig</th>
              <th className="px-4 py-3">Regel</th>
              <th className="px-4 py-3">Ernst</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Tijd</th>
              <th className="px-4 py-3">Actie</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-t border-slate-200 hover:bg-white/40">
                <td className="px-4 py-3">
                  <span className="mr-1">{e.vehicle.iconEmoji}</span>
                  {e.vehicle.displayName ?? e.vehicle.name}
                </td>
                <td className="px-4 py-3">{e.rule.name}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${sevColor[e.severity]}`}>
                    {e.severity}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${statusColor[e.status]}`}>
                    {e.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {new Date(e.startTime).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => {
                      setSelected(e);
                      setNotes("");
                    }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Bekijken
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {events.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-400">Geen events.</p>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-300 bg-white p-5">
            <h3 className="mb-3 text-lg font-bold">
              {selected.vehicle.iconEmoji} {selected.rule.name}
            </h3>
            <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-slate-400">Voertuig</p>
                <p>{selected.vehicle.displayName ?? selected.vehicle.name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Ernst</p>
                <span className={`rounded-full px-2 py-0.5 text-xs ${sevColor[selected.severity]}`}>
                  {selected.severity}
                </span>
              </div>
              <div>
                <p className="text-xs text-slate-400">Start</p>
                <p>{new Date(selected.startTime).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Einde</p>
                <p>{selected.endTime ? new Date(selected.endTime).toLocaleString() : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Gemeten</p>
                <p>{selected.measuredValue != null ? Math.round(selected.measuredValue) : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Drempel</p>
                <p>{selected.threshold != null ? Math.round(selected.threshold) : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Locatie</p>
                <p className="font-mono text-xs">
                  {selected.latitude != null
                    ? `${selected.latitude.toFixed(5)}, ${selected.longitude?.toFixed(5)}`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Duur</p>
                <p>{selected.durationSec != null ? `${selected.durationSec}s` : "—"}</p>
              </div>
            </div>

            <label className="mb-1 block text-sm text-slate-400">Notities</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mb-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void updateEvent(selected.id, { status: "under_review", reviewNotes: notes })}
                className="rounded-lg bg-amber-600 px-3 py-2 text-sm"
              >
                In beoordeling
              </button>
              <button
                onClick={() => void updateEvent(selected.id, { status: "resolved", reviewNotes: notes })}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm"
              >
                Opgelost
              </button>
              <button
                onClick={() => void updateEvent(selected.id, { status: "dismissed", reviewNotes: notes })}
                className="rounded-lg bg-slate-700 px-3 py-2 text-sm"
              >
                Afwijzen
              </button>
              <button
                onClick={() => setSelected(null)}
                className="ml-auto rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                Sluiten
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

