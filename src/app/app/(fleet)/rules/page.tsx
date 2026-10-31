"use client";

// Regels-pagina: iedereen mag bekijken; alleen admin maakt/bewerkt/verwijdert
import { useCallback, useEffect, useState } from "react";

type RuleCondition = {
  field: string;
  operator: string;
  value1: number | null;
  value2: number | null;
};

type Rule = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  logic: string;
  severity: string;
  thresholdValue: number | null;
  timezone: string;
  weekdays: number[];
  timeFrom: string | null;
  timeTo: string | null;
  conditions: RuleCondition[];
  geofence: { id: string; name: string } | null;
  version: number;
  createdAt: string;
};

const FIELD_OPTIONS = [
  { value: "speed_kmh", label: "Snelheid (km/u)" },
  { value: "last_seen_age_s", label: "Laatst gezien (sec)" },
  { value: "hour_of_day", label: "Uur van de dag" },
  { value: "day_of_week", label: "Dag van de week" },
  { value: "latitude", label: "Breedtegraad" },
  { value: "longitude", label: "Lengtegraad" },
];

const OPERATOR_OPTIONS: Record<string, { value: string; label: string }[]> = {
  speed_kmh: [
    { value: "gt", label: "Groter dan" },
    { value: "gte", label: "Groter of gelijk" },
    { value: "lt", label: "Kleiner dan" },
    { value: "lte", label: "Kleiner of gelijk" },
  ],
  last_seen_age_s: [
    { value: "gt", label: "Ouder dan (sec)" },
    { value: "lt", label: "Nieuwer dan (sec)" },
  ],
  hour_of_day: [
    { value: "between", label: "Tussen uren" },
    { value: "outside_hours", label: "Buiten uren" },
  ],
  day_of_week: [{ value: "eq", label: "Op dag" }],
  latitude: [
    { value: "gt", label: "Noorderlijker dan" },
    { value: "lt", label: "Zuidelijker dan" },
  ],
  longitude: [
    { value: "gt", label: "Oostelijker dan" },
    { value: "lt", label: "Westelijker dan" },
  ],
};

const EMPTY_CONDITION: RuleCondition = {
  field: "speed_kmh",
  operator: "gt",
  value1: 80,
  value2: null,
};

export default function RulesPage() {
  const [me, setMe] = useState<{ role: string } | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    name: string;
    description: string;
    severity: string;
    thresholdValue: number | null;
    conditions: RuleCondition[];
  }>({
    name: "",
    description: "",
    severity: "warning",
    thresholdValue: 80,
    conditions: [EMPTY_CONDITION],
  });

  const load = useCallback(async () => {
    const [meRes, rulesRes] = await Promise.all([
      fetch("/api/me"),
      fetch("/api/rules"),
    ]);
    if (meRes.ok) setMe(await meRes.json());
    if (rulesRes.ok) {
      const d = await rulesRes.json();
      setRules(d.rules);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!form.name.trim()) {
      setError("Naam is verplicht");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      severity: form.severity,
      thresholdValue: form.thresholdValue,
      logic: "single",
      conditions: form.conditions.filter((c) => c.field && c.operator),
    };

    try {
      const url = editing ? `/api/rules/${editing.id}` : "/api/rules";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? `Fout ${res.status}`);
        return;
      }
      setShowForm(false);
      setEditing(null);
      void load();
    } catch {
      setError("Netwerkfout");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(rule: Rule) {
    await fetch(`/api/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    void load();
  }

  async function deleteRule(id: string) {
    if (!confirm("Regel verwijderen?")) return;
    await fetch(`/api/rules/${id}`, { method: "DELETE" });
    void load();
  }

  function editRule(rule: Rule) {
    setEditing(rule);
    setForm({
      name: rule.name,
      description: rule.description ?? "",
      severity: rule.severity,
      thresholdValue: rule.thresholdValue,
      conditions:
        rule.conditions.length > 0
          ? rule.conditions
          : [EMPTY_CONDITION],
    });
    setShowForm(true);
    setError(null);
  }

  const isAdmin = me?.role === "admin";

  const sevColor: Record<string, string> = {
    info: "bg-sky-500/20 text-blue-600",
    warning: "bg-amber-50 text-amber-700",
    critical: "bg-red-50 text-red-600",
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Regels</h1>
          <p className="text-sm text-slate-400">
            Configurabele monitoringsregels
            {!isAdmin && " Â· alleen-lezen"}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => {
              setEditing(null);
              setForm({
                name: "",
                description: "",
                severity: "warning",
                thresholdValue: 80,
                conditions: [EMPTY_CONDITION],
              });
              setError(null);
              setShowForm(true);
            }}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500"
          >
            + Nieuwe regel
          </button>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {showForm && (
        <div className="mb-6 rounded-xl border border-slate-300 bg-white p-5">
          <h2 className="mb-4 font-semibold">
            {editing ? "Regel bewerken" : "Nieuwe regel"}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Naam *
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Bijv. Snelheid > 80 km/u"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              Ernst
              <select
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              >
                <option value="info">Info</option>
                <option value="warning">Waarschuwing</option>
                <option value="critical">Kritiek</option>
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              Beschrijving
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optioneel"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              />
            </label>
          </div>

          <h3 className="mb-2 mt-4 text-sm font-semibold">Voorwaarden</h3>
          {form.conditions.map((cond, i) => (
            <div key={i} className="mb-2 flex flex-wrap items-center gap-2">
              <select
                value={cond.field}
                onChange={(e) => {
                  const newConds = [...form.conditions];
                  newConds[i] = {
                    ...newConds[i],
                    field: e.target.value,
                    operator: OPERATOR_OPTIONS[e.target.value]?.[0]?.value ?? "gt",
                  };
                  setForm({ ...form, conditions: newConds });
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {FIELD_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <select
                value={cond.operator}
                onChange={(e) => {
                  const newConds = [...form.conditions];
                  newConds[i] = { ...newConds[i], operator: e.target.value };
                  setForm({ ...form, conditions: newConds });
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {(OPERATOR_OPTIONS[cond.field] ?? []).map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={cond.value1 ?? ""}
                onChange={(e) => {
                  const newConds = [...form.conditions];
                  newConds[i] = {
                    ...newConds[i],
                    value1: e.target.value ? Number(e.target.value) : null,
                  };
                  setForm({ ...form, conditions: newConds });
                }}
                placeholder="Waarde"
                className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
              {cond.operator === "between" && (
                <input
                  type="number"
                  value={cond.value2 ?? ""}
                  onChange={(e) => {
                    const newConds = [...form.conditions];
                    newConds[i] = {
                      ...newConds[i],
                      value2: e.target.value ? Number(e.target.value) : null,
                    };
                    setForm({ ...form, conditions: newConds });
                  }}
                  placeholder="Tot"
                  className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              )}
            </div>
          ))}

          <div className="mt-4 flex gap-2">
            <button
              onClick={save}
              disabled={saving || !form.name.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Bezig…" : editing ? "Bijwerken" : "Aanmaken"}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setEditing(null);
                setError(null);
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
            >
              Annuleren
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-white text-left text-xs text-slate-400">
            <tr>
              <th className="px-4 py-3">Naam</th>
              <th className="px-4 py-3">Voorwaarde</th>
              <th className="px-4 py-3">Ernst</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Acties</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-t border-slate-200">
                <td className="px-4 py-3">
                  <p className="font-medium">{r.name}</p>
                  {r.description && (
                    <p className="text-xs text-slate-400">{r.description}</p>
                  )}
                  <p className="text-xs text-slate-600">v{r.version}</p>
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {r.conditions.length === 0
                    ? `Drempel: ${r.thresholdValue ?? "—"}`
                    : r.conditions.map((c, i) => (
                        <span key={i} className="mr-2 block">
                          {FIELD_OPTIONS.find((f) => f.value === c.field)?.label}{" "}
                          {OPERATOR_OPTIONS[c.field]?.find((o) => o.value === c.operator)?.label}{" "}
                          <strong>{c.value1}</strong>
                        </span>
                      ))}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${sevColor[r.severity] ?? sevColor.info}`}
                  >
                    {r.severity}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {isAdmin ? (
                    <button
                      onClick={() => void toggleEnabled(r)}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        r.enabled
                          ? "bg-green-50 text-green-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {r.enabled ? "Actief" : "Uit"}
                    </button>
                  ) : (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        r.enabled
                          ? "bg-green-50 text-green-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {r.enabled ? "Actief" : "Uit"}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {isAdmin ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => editRule(r)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Bewerken
                      </button>
                      <button
                        onClick={() => void deleteRule(r.id)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Verwijderen
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-600">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rules.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-400">
            Nog geen regels. Klik op &quot;+ Nieuwe regel&quot; om te beginnen.
          </p>
        )}
      </div>
    </div>
  );
}

