"use client";

// Personen-pagina: lijst, toevoegen, bewerken, verwijderen
import { useCallback, useEffect, useState } from "react";

type Person = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  country: string | null;
  zipcode: string | null;
  city: string | null;
  notes: string | null;
  vehicles: { id: string; displayName: string; licensePlate: string | null }[];
};

const EMPTY: Partial<Person> = {
  name: "",
  email: "",
  phone: "",
  address: "",
  country: "",
  zipcode: "",
  city: "",
  notes: "",
};

export default function PersonsPage() {
  const [persons, setPersons] = useState<Person[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Person | "new" | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/persons");
    if (res.ok) {
      const d = await res.json();
      setPersons(d.persons);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!form.name?.trim()) {
      setError("Naam is verplicht");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const isNew = editing === "new";
      const url = isNew ? "/api/persons" : `/api/persons/${(editing as Person).id}`;
      const method = isNew ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? `Fout ${res.status}`);
        return;
      }
      setEditing(null);
      void load();
    } catch {
      setError("Netwerkfout");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Persoon naar de prullenbak verplaatsen? Koppelingen blijven bewaard en je kunt herstellen.")) return;
    await fetch(`/api/persons/${id}`, { method: "DELETE" });
    void load();
  }

  const filtered = persons.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (p.city ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Personen</h1>
          <p className="text-sm text-slate-400">{persons.length} personen</p>
        </div>
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoeken…"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
          <button
            onClick={() => { setEditing("new"); setForm(EMPTY); setError(null); }}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500"
          >
            + Persoon
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
      )}

      {/* Formulier */}
      {editing && (
        <div className="mb-6 rounded-xl border border-slate-300 bg-white p-4 sm:p-5">
          <h2 className="mb-4 font-semibold">
            {editing === "new" ? "Nieuwe persoon" : "Persoon bewerken"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { key: "name", label: "Naam *", type: "text" },
              { key: "email", label: "E-mail", type: "email" },
              { key: "phone", label: "Telefoon", type: "tel" },
              { key: "address", label: "Adres", type: "text" },
              { key: "zipcode", label: "Postcode", type: "text" },
              { key: "city", label: "Woonplaats", type: "text" },
              { key: "country", label: "Land", type: "text" },
            ].map((f) => (
              <label key={f.key} className="text-sm">
                {f.label}
                <input
                  type={f.type}
                  value={(form as Record<string, string>)[f.key] ?? ""}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                />
              </label>
            ))}
            <label className="text-sm sm:col-span-2">
              Notities
              <textarea
                value={form.notes ?? ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Bezig…" : "Opslaan"}
            </button>
            <button
              onClick={() => setEditing(null)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
            >
              Annuleren
            </button>
          </div>
        </div>
      )}

      {/* Lijst */}
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white text-left text-xs text-slate-400">
              <tr>
                <th className="px-4 py-3">Naam</th>
                <th className="hidden px-4 py-3 sm:table-cell">E-mail</th>
                <th className="hidden px-4 py-3 sm:table-cell">Telefoon</th>
                <th className="hidden px-4 py-3 md:table-cell">Plaats</th>
                <th className="px-4 py-3">Voertuigen</th>
                <th className="px-4 py-3">Actie</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-slate-200 hover:bg-white/40">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="hidden px-4 py-3 text-slate-400 sm:table-cell">
                    {p.email ?? "—"}
                  </td>
                  <td className="hidden px-4 py-3 text-slate-400 sm:table-cell">
                    {p.phone ?? "—"}
                  </td>
                  <td className="hidden px-4 py-3 text-slate-400 md:table-cell">
                    {p.city ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {p.vehicles.length > 0
                      ? p.vehicles.map((v) => v.displayName).join(", ")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditing(p);
                          setForm({
                            name: p.name,
                            email: p.email,
                            phone: p.phone,
                            address: p.address,
                            country: p.country,
                            zipcode: p.zipcode,
                            city: p.city,
                            notes: p.notes,
                          });
                          setError(null);
                        }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Bewerken
                      </button>
                      <button
                        onClick={() => void remove(p.id)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Verwijderen
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-400">
            {search ? "Geen resultaten." : "Nog geen personen. Voeg er een toe."}
          </p>
        )}
      </div>
    </div>
  );
}

