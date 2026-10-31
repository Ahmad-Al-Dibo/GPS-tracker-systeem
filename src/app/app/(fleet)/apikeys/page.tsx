"use client";

// API Keys — light theme, mockup-stijl
import { useCallback, useEffect, useState } from "react";

type ApiKeyRow = {
  id: string;
  keyPrefix: string;
  label: string;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel] = useState("");
  const [createdKey, setCreatedKey] = useState<{ raw: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/keys");
      if (res.ok) {
        const d = await res.json();
        setKeys(d.keys);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createKey() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || "Default" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? `Fout ${res.status}`);
        return;
      }
      setCreatedKey({ raw: data.apiKey, label: data.label });
      setShowCreate(false);
      setLabel("");
      setSuccess("API-key succesvol aangemaakt!");
      setTimeout(() => setSuccess(null), 4000);
      void load();
    } catch {
      setError("Netwerkfout");
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(id: string) {
    if (!confirm("Deze key intrekken? Verzoeken ermee worden geweigerd.")) return;
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
    void load();
  }

  async function copyKey(raw: string) {
    try {
      await navigator.clipboard.writeText(raw);
      setSuccess("Gekopieerd!");
      setTimeout(() => setSuccess(null), 2000);
    } catch {}
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 lg:mb-6">
        <h1 className="text-xl font-bold lg:text-2xl">API Keys</h1>
        <p className="text-sm text-slate-500">
          API-keys stellen externe systemen en integraties in staat om veilig te communiceren met je GPS-systeem.
        </p>
      </div>

      {success && (
        <p className="mb-4 rounded-lg bg-green-50 px-4 py-2.5 text-sm text-green-700">
          ✓ {success}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>
      )}

      <button
        onClick={() => setShowCreate(true)}
        className="mb-6 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto sm:px-6"
      >
        + Create API Key
      </button>

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-slate-900">Nieuwe API-key</h2>
          <label className="block text-sm text-slate-700">
            Label
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Bijv. Production Key"
              autoFocus
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <div className="mt-4 flex gap-2">
            <button onClick={createKey} disabled={creating}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {creating ? "Bezig…" : "Aanmaken"}
            </button>
            <button onClick={() => setShowCreate(false)}
              className="rounded-lg border border-slate-300 px-5 py-2 text-sm text-slate-700 hover:bg-slate-50">
              Annuleren
            </button>
          </div>
        </div>
      )}

      {/* Created key popup */}
      {createdKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-600">✓</span>
              <div>
                <h3 className="font-semibold text-slate-900">API key created successfully!</h3>
                <p className="text-sm text-slate-500">
                  Zorg dat je de key nu kopieert — je kunt hem daarna niet meer zien.
                </p>
              </div>
            </div>
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="break-all font-mono text-sm text-slate-800">{createdKey.raw}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => void copyKey(createdKey.raw)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                📋 Copy
              </button>
              <button onClick={() => setCreatedKey(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Key list */}
      {loading ? (
        <p className="text-sm text-slate-400">Laden…</p>
      ) : keys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-3xl">🔑</p>
          <p className="mt-2 text-sm text-slate-400">
            Nog geen API-keys. Maak er een om te beginnen.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {keys.map((k) => (
            <li key={k.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🔑</span>
                    <p className="truncate font-semibold text-slate-900">{k.label}</p>
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-blue-600">{k.keyPrefix}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Aangemaakt: {new Date(k.createdAt).toLocaleDateString()}
                    {k.lastUsedAt && ` · Laatst gebruikt: ${new Date(k.lastUsedAt).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    k.isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
                  }`}>
                    {k.isActive ? "● Active" : "● Revoked"}
                  </span>
                  {k.isActive && (
                    <button onClick={() => void revokeKey(k.id)}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
