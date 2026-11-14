"use client";

// Login — GPS Manager light theme
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Alleen relatieve paden toestaan: "//evil.com" en "https://evil.com"
  // mogen een net-ingelogde gebruiker niet van de site afleiden (open redirect).
  const rawCallback = params.get("callbackUrl") ?? "/app";
  const callbackUrl =
    rawCallback.startsWith("/") && !rawCallback.startsWith("//") ? rawCallback : "/app";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Inloggen mislukt");
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("Netwerkfout");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block text-sm font-medium text-slate-700">
        Gebruikersnaam
        <div className="mt-1.5 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">👤</span>
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            autoComplete="username"
            placeholder="Voer je gebruikersnaam in"
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </label>

      <label className="block text-sm font-medium text-slate-700">
        Wachtwoord
        <div className="mt-1.5 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔒</span>
          <input
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="Voer je wachtwoord in"
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="button"
            onClick={() => setShowPw(!showPw)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            tabIndex={-1}
          >
            {showPw ? "🙈" : "👁️"}
          </button>
        </div>
      </label>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="login-submit w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Bezig met inloggen…" : "Log In"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="login-shell flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="login-logo mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg">
            <svg viewBox="0 0 36 36" fill="none" aria-hidden="true">
              <path d="M18 33s11-10.2 11-19A11 11 0 0 0 7 14c0 8.8 11 19 11 19Z" fill="currentColor" />
              <circle cx="18" cy="14" r="4" fill="#10203a" />
            </svg>
          </span>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">GPS Manager</h1>
          <p className="mt-1 text-sm text-slate-500">Secure · Track · Manage</p>
        </div>

        <div className="login-card rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Admin Login</h2>
          <p className="mb-5 text-sm text-slate-500">
            Log in om toegang te krijgen tot het GPS-managementsysteem.
          </p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          © 2026 GPS Manager
        </p>
      </div>
    </div>
  );
}
