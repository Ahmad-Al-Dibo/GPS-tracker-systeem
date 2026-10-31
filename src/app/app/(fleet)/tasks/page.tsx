"use client";

// Taken-pagina — toewijzen aan persoon en/of voertuig
import { useCallback, useEffect, useState } from "react";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  vehicle: { id: string; displayName: string; iconEmoji: string } | null;
  assignee: { username: string } | null;
  creator: { username: string };
  createdAt: string;
};

type VehicleOption = {
  id: string;
  displayName: string;
  iconEmoji: string;
  licensePlate: string | null;
  persons: { id: string; name: string }[];
};

type PersonOption = { id: string; name: string };

const statusColor: Record<string, string> = {
  open: "bg-blue-50 text-blue-600",
  in_progress: "bg-amber-50 text-amber-600",
  overdue: "bg-red-50 text-red-600",
  done: "bg-green-50 text-green-600",
  cancelled: "bg-slate-100 text-slate-500",
};
const statusLabel: Record<string, string> = {
  open: "Open",
  in_progress: "In uitvoering",
  overdue: "Te laat",
  done: "Klaar",
  cancelled: "Geannuleerd",
};
const prioColor: Record<string, string> = {
  low: "bg-slate-100 text-slate-500",
  medium: "bg-blue-50 text-blue-600",
  high: "bg-amber-50 text-amber-600",
  urgent: "bg-red-50 text-red-600",
};
const prioLabel: Record<string, string> = {
  low: "Laag",
  medium: "Middel",
  high: "Hoog",
  urgent: "Urgent",
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [persons, setPersons] = useState<PersonOption[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Formulier-state
  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "medium",
    dueDate: "",
    vehicleId: "",
    assigneeId: "",
  });
  // Personen gekoppeld aan geselecteerd voertuig
  const [vehiclePersons, setVehiclePersons] = useState<PersonOption[]>([]);
  // Of de gebruiker expliciet "geen persoon" heeft gekozen
  const [noPerson, setNoPerson] = useState(false);

  const load = useCallback(async () => {
    const params = statusFilter ? `?status=${statusFilter}` : "";
    const [tRes, vRes, pRes] = await Promise.all([
      fetch(`/api/tasks${params}`),
      fetch("/api/vehicles"),
      fetch("/api/persons"),
    ]);
    if (tRes.ok) {
      const d = await tRes.json();
      setTasks(d.tasks);
    }
    if (vRes.ok) {
      const d = await vRes.json();
      setVehicles(d.vehicles);
    }
    if (pRes.ok) {
      const d = await pRes.json();
      setPersons(d.persons);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  // Wanneer voertuig wordt geselecteerd: gekoppelde personen ophalen
  useEffect(() => {
    if (!form.vehicleId) {
      setVehiclePersons([]);
      return;
    }
    const vehicle = vehicles.find((v) => v.id === form.vehicleId);
    setVehiclePersons(vehicle?.persons ?? []);
    // Reset persoon-selectie bij voertuig-wissel
    setForm((f) => ({ ...f, assigneeId: "" }));
    setNoPerson(false);
  }, [form.vehicleId, vehicles]);

  async function createTask() {
    setError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          priority: form.priority,
          dueDate: form.dueDate || null,
          vehicleId: form.vehicleId || null,
          assigneeId: noPerson ? null : form.assigneeId || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? `Fout ${res.status}`);
        return;
      }
      setShowForm(false);
      setForm({ title: "", description: "", priority: "medium", dueDate: "", vehicleId: "", assigneeId: "" });
      setNoPerson(false);
      setVehiclePersons([]);
      void load();
    } catch {
      setError("Netwerkfout");
    }
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    void load();
  }

  async function deleteTask(id: string) {
    if (!confirm("Taak verwijderen?")) return;
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    void load();
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold lg:text-2xl">Taken</h1>
          <p className="text-sm text-slate-500">Taken gekoppeld aan voertuigen en personen</p>
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
          >
            <option value="">Alle</option>
            <option value="open">Open</option>
            <option value="in_progress">In uitvoering</option>
            <option value="overdue">Te laat</option>
            <option value="done">Klaar</option>
            <option value="cancelled">Geannuleerd</option>
          </select>
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + Taak
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
      )}

      {/* Nieuw taak-formulier */}
      {showForm && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
          <h2 className="mb-4 font-semibold text-slate-900">Nieuwe taak</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-700 sm:col-span-2">
              Titel *
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Bijv. Controleer bandenspanning"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
              />
            </label>
            <label className="text-sm text-slate-700 sm:col-span-2">
              Beschrijving
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
              />
            </label>
            <label className="text-sm text-slate-700">
              Prioriteit
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
              >
                <option value="low">Laag</option>
                <option value="medium">Middel</option>
                <option value="high">Hoog</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label className="text-sm text-slate-700">
              Vervaldatum
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
              />
            </label>

            {/* Voertuig selectie */}
            <label className="text-sm text-slate-700">
              Voertuig (optioneel)
              <select
                value={form.vehicleId}
                onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
              >
                <option value="">Geen voertuig</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.iconEmoji} {v.displayName}
                    {v.licensePlate ? ` (${v.licensePlate})` : ""}
                  </option>
                ))}
              </select>
            </label>

            {/* Persoon selectie — toont gekoppelde personen van voertuig */}
            <label className="text-sm text-slate-700">
              Toewijzen aan
              <select
                value={noPerson ? "__none__" : form.assigneeId}
                onChange={(e) => {
                  if (e.target.value === "__none__") {
                    setNoPerson(true);
                    setForm({ ...form, assigneeId: "" });
                  } else {
                    setNoPerson(false);
                    setForm({ ...form, assigneeId: e.target.value });
                  }
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
              >
                <option value="">Iedereen (geen specifieke persoon)</option>
                {form.vehicleId && vehiclePersons.length > 0 && (
                  <>
                    <optgroup label="Gekoppeld aan voertuig">
                      {vehiclePersons.map((p) => (
                        <option key={p.id} value={p.id}>
                          👤 {p.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Alle personen">
                      {persons.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </optgroup>
                  </>
                )}
                {!form.vehicleId && persons.length > 0 && (
                  <>
                    {persons.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </label>
          </div>

          {form.vehicleId && vehiclePersons.length > 0 && (
            <p className="mt-2 text-xs text-slate-400">
              💡 {vehiclePersons.length} persoon/persoonen gekoppeld aan dit voertuig —
              kies er een of laat leeg voor iedereen.
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={createTask}
              disabled={!form.title.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Aanmaken
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

      {/* Taken-lijst */}
      <div className="space-y-3">
        {tasks.map((t) => (
          <div
            key={t.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{t.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${prioColor[t.priority]}`}>
                    {prioLabel[t.priority]}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[t.status]}`}>
                    {statusLabel[t.status]}
                  </span>
                </div>
                {t.description && (
                  <p className="mt-1 text-sm text-slate-500">{t.description}</p>
                )}
                <p className="mt-1 text-xs text-slate-400">
                  {t.vehicle?.iconEmoji} {t.vehicle?.displayName ?? "Geen voertuig"} · door {t.creator.username}
                  {t.assignee && ` · aan ${t.assignee.username}`}
                  {t.dueDate && (
                    <>
                      {" · vervaldatum "}
                      <span className={t.status === "overdue" ? "font-semibold text-red-500" : ""}>
                        {new Date(t.dueDate).toLocaleDateString("nl-NL")}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {t.status !== "done" && (
                  <button
                    onClick={() => void updateStatus(t.id, "done")}
                    className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-600 hover:bg-green-100"
                  >
                    ✓ Klaar
                  </button>
                )}
                {(t.status === "open" || t.status === "overdue") && (
                  <button
                    onClick={() => void updateStatus(t.id, "in_progress")}
                    className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-100"
                  >
                    ▶ Start
                  </button>
                )}
                <button
                  onClick={() => void deleteTask(t.id)}
                  className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-100"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {tasks.length === 0 && (
        <p className="p-10 text-center text-sm text-slate-400">Geen taken.</p>
      )}
    </div>
  );
}
