"use client";

// Prullenbak — verwijderde personen en voertuigen (soft delete)
// Tabs, gesorteerd op verwijderdatum (nieuwste eerst), herstellen + definitief verwijderen.
import { useCallback, useEffect, useState } from "react";

type Dependencies = {
  links?: number;
  gpsPoints?: number;
  events?: number;
  tasks?: number;
};

type TrashItem = {
  id: string;
  name: string;
  email?: string | null;
  city?: string | null;
  licensePlate?: string | null;
  vehicleGroup?: string | null;
  deletedAt: string;
  deletedBy: string | null;
  deletedByName: string | null;
  dependencies: Dependencies;
};

type Tab = "persons" | "vehicles";

export default function TrashPage() {
  const [tab, setTab] = useState<Tab>("persons");
  const [items, setItems] = useState<TrashItem[]>([]);
  const [me, setMe] = useState<{ role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (t: Tab) => {
    setLoading(true);
    setError(null);
    const [res, meRes] = await Promise.all([
      fetch(`/api/trash?type=${t}`),
      fetch("/api/me"),
    ]);
    if (meRes.ok) setMe(await meRes.json());
    if (res.ok) {
      const d = await res.json();
      setItems(d.items);
    } else {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? `Fout ${res.status}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  async function restore(item: TrashItem) {
    const isPerson = tab === "persons";
    if (!confirm(`${isPerson ? "Persoon" : "Voertuig"} "${item.name}" herstellen?`)) return;
    setBusyId(item.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/${isPerson ? "persons" : "vehicles"}/${item.id}/restore`,
        { method: "POST" }
      );
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setError(d?.error ?? `Fout ${res.status}`);
        return;
      }
      void load(tab);
    } catch {
      setError("Netwerkfout");
    } finally {
      setBusyId(null);
    }
  }

  async function purge(item: TrashItem) {
    const isPerson = tab === "persons";
    const deps = item.dependencies;
    const parts: string[] = [];
    if (deps.links) parts.push(`${deps.links} koppeling(en)`);
    if (deps.gpsPoints) parts.push(`${deps.gpsPoints} GPS-punt(en)`);
    if (deps.events) parts.push(`${deps.events} event(s)`);
    if (deps.tasks) parts.push(`${deps.tasks} taak(taken) (verliezen de voertuigkoppeling)`);

    const msg =
      `"${item.name}" definitief verwijderen?\n\n` +
      (parts.length > 0
        ? `Dit verwijderd ook:\n- ${parts.join("\n- ")}\n\n`
        : "") +
      "Dit kan niet ongedaan worden gemaakt.";

    if (!confirm(msg)) return;
    setBusyId(item.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/${isPerson ? "persons" : "vehicles"}/${item.id}?permanent=true&confirm=true`,
        { method: "DELETE" }
      );
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setError(d?.error ?? `Fout ${res.status}`);
        return;
      }
      void load(tab);
    } catch {
      setError("Netwerkfout");
    } finally {
      setBusyId(null);
    }
  }

  const isAdmin = me?.role === "admin";

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("nl-NL", {
      dateStyle: "medium",
      timeStyle: "short",
    });

  const tabButton = (t: Tab, label: string, count?: number) => (
    <button
      onClick={() => setTab(t)}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        tab === t
          ? "bg-slate-900 text-white"
          : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
      }`}
    >
      {label}
      {typeof count === "number" && (
        <span className={`ml-2 rounded-full px-1.5 py-0.5 text-xs ${tab === t ? "bg-white/20" : "bg-slate-100"}`}>
          {count}
        </span>
      )}
    </button>
  );

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl font-bold lg:text-2xl">Prullenbak</h1>
        <p className="text-sm text-slate-500">
          Verwijderde records — herstellen of definitief verwijderen
        </p>
      </div>

      <div className="mb-4 flex gap-2">
        {tabButton("persons", "Personen")}
        {tabButton("vehicles", "Voertuigen")}
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr>
                <th className="px-4 py-3">Naam</th>
                <th className="hidden px-4 py-3 sm:table-cell">
                  {tab === "persons" ? "E-mail" : "Kenteken"}
                </th>
                <th className="px-4 py-3">Verwijderd op</th>
                <th className="hidden px-4 py-3 md:table-cell">Verwijderd door</th>
                <th className="hidden px-4 py-3 lg:table-cell">Afhankelijkheden</th>
                <th className="px-4 py-3">Actie</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                  <td className="hidden px-4 py-3 text-slate-500 sm:table-cell">
                    {tab === "persons" ? item.email ?? "—" : item.licensePlate ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(item.deletedAt)}</td>
                  <td className="hidden px-4 py-3 text-slate-500 md:table-cell">
                    {item.deletedByName ?? "—"}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-slate-400 lg:table-cell">
                    {tab === "persons"
                      ? `${item.dependencies.links ?? 0} koppeling(en)`
                      : [
                          `${item.dependencies.gpsPoints ?? 0} GPS-punten`,
                          `${item.dependencies.events ?? 0} events`,
                          `${item.dependencies.tasks ?? 0} taken`,
                          `${item.dependencies.links ?? 0} koppelingen`,
                        ].join(" · ")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => void restore(item)}
                        disabled={busyId === item.id}
                        className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100 disabled:opacity-50"
                      >
                        ↩ Herstellen
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => void purge(item)}
                          disabled={busyId === item.id}
                          className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
                        >
                          🗑 Definitief
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && items.length === 0 && (
          <p className="p-10 text-center text-sm text-slate-400">
            De prullenbak is leeg.
          </p>
        )}
        {loading && <p className="p-10 text-center text-sm text-slate-400">Laden…</p>}
      </div>
    </div>
  );
}
