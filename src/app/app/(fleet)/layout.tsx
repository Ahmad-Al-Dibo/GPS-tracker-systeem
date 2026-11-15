"use client";

// GPS Manager — sidebar (desktop) + bottom-nav (mobiel)
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

type NavItem = { href: string; label: string; icon: string };

const NAV_ITEMS: NavItem[] = [
  { href: "/app", label: "Dashboard", icon: "🏠" },
  { href: "/app/vehicles", label: "Voertuigen", icon: "🚗" },
  { href: "/app/persons", label: "Personen", icon: "👥" },
  { href: "/app/devices", label: "Trackers", icon: "📡" },
  { href: "/app/apikeys", label: "API Keys", icon: "🔑" },
  { href: "/app/map", label: "Kaart", icon: "🗺️" },
  { href: "/app/history", label: "Historie", icon: "📜" },
  { href: "/app/rules", label: "Regels", icon: "📏" },
  { href: "/app/alerts", label: "Alerts", icon: "🚨" },
  { href: "/app/geofences", label: "Geofences", icon: "⬡" },
  { href: "/app/locations", label: "Locaties & Routes", icon: "📍" },
  { href: "/app/tasks", label: "Taken", icon: "✅" },
  { href: "/app/reports", label: "Rapporten", icon: "📈" },
  { href: "/app/trash", label: "Prullenbak", icon: "🗑️" },
  { href: "/app/settings", label: "Instellingen", icon: "⚙️" },
];

const MOBILE_NAV = NAV_ITEMS.slice(0, 4);

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<{ username: string; role: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const activePage =
    NAV_ITEMS.find(
      (item) =>
        pathname === item.href ||
        (item.href !== "/app" && pathname.startsWith(item.href + "/"))
    ) ?? NAV_ITEMS[0];

  const loadMe = useCallback(
    async (signal?: AbortSignal) => {
      const MAX_ATTEMPTS = 2;
      let lastError = "Onbekende fout";

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (signal?.aborted) return;

        try {
          const res = await fetch("/api/me", { signal });
          if (signal?.aborted) return;

          if (res.status === 401) {
            router.push("/login");
            return;
          }

          if (res.ok) {
            const data = await res.json();
            if (signal?.aborted) return;
            setMe(data);
            setLoadError(null);
            setLoading(false);
            return;
          }

          lastError = `Serverfout (${res.status})`;
          // Alleen 5xx opnieuw proberen (transient); 4xx is een client-fout
          if (res.status < 500) break;
        } catch {
          if (signal?.aborted) return;
          lastError = "Netwerkfout — kon de server niet bereiken";
          // Netwerkfout: altijd opnieuw proberen
        }

        // Wachttijd vóór volgende poging; aborted → stoppen
        if (attempt < MAX_ATTEMPTS) {
          await new Promise<void>((resolve) => {
            const t = setTimeout(resolve, 500 * attempt);
            signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
          });
          if (signal?.aborted) return;
        }
      }

      setLoadError(lastError);
      setLoading(false);
    },
    [router]
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadMe(controller.signal);
    return () => controller.abort();
  }, [loadMe, loadAttempt]);

  // Sluit menu bij navigatie
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Netwerkfout bij uitloggen — toch redirecten
    }
    router.push("/");
  }

  if (loading) {
    return (
      <div className="app-loading flex h-screen items-center justify-center">
        <div className="text-slate-400">Laden…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="app-loading flex h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-red-600">{loadError}</p>
        <button
          onClick={() => {
            setLoading(true);
            setLoadError(null);
            setLoadAttempt((n) => n + 1);
          }}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Opnieuw proberen
        </button>
      </div>
    );
  }

  return (
    <div className="app-shell flex min-h-screen">
      {/* Sidebar desktop */}
      <aside className="app-sidebar fixed inset-y-0 left-0 z-[100] hidden w-[220px] flex-col lg:flex">
        <div className="app-brand flex items-center gap-3 px-4 py-5">
          <span className="app-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 36 36" fill="none">
              <path d="M18 33s11-10.2 11-19A11 11 0 0 0 7 14c0 8.8 11 19 11 19Z" fill="currentColor" />
              <circle cx="18" cy="14" r="4" fill="#10203a" />
              <path d="M25 5a13 13 0 0 1 6 6M27 1a18 18 0 0 1 8 8" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <p className="text-[13px] font-bold text-white">GPS Manager</p>
            <p className="text-[10px] text-slate-400">Track. Manage. Control.</p>
          </div>
        </div>

        <nav className="app-navigation flex-1 overflow-y-auto px-2.5 py-3" aria-label="Hoofdnavigatie">
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/app" && pathname.startsWith(item.href + "/"));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`app-nav-link mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                  active
                    ? "is-active font-medium text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <span className="app-nav-icon text-[15px]" aria-hidden="true">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="app-user border-t border-slate-800 px-3 py-3">
          <div className="mb-2 flex min-w-0 items-center gap-2.5 px-1">
            <span className="app-avatar">{me?.username?.slice(0, 1).toUpperCase() ?? "?"}</span>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold text-white">{me?.username ?? ""}</p>
              <p className="text-[10px] text-slate-400">{me?.role ?? "Beheerder"}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="app-logout flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[12px] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            Uitloggen
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="app-mobile-header fixed inset-x-0 top-0 z-[100] flex items-center justify-between px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <span className="app-brand-mark app-brand-mark-small" aria-hidden="true">
            <svg viewBox="0 0 36 36" fill="none">
              <path d="M18 33s11-10.2 11-19A11 11 0 0 0 7 14c0 8.8 11 19 11 19Z" fill="currentColor" />
              <circle cx="18" cy="14" r="4" fill="#10203a" />
            </svg>
          </span>
          <span className="text-sm font-bold">GPS Manager</span>
        </div>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="app-menu-toggle rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Menu"
          aria-expanded={menuOpen}
        >
          {menuOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* Mobile menu overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-[99] lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMenuOpen(false)} />
          <div className="app-mobile-menu absolute right-0 top-14 w-64 rounded-l-xl p-3 shadow-xl">
            <p className="mb-2 px-3 text-[11px] text-slate-500">
              {me?.username ?? ""}
            </p>
            {NAV_ITEMS.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/app" && pathname.startsWith(item.href + "/"));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`app-nav-link mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] ${
                    active
                      ? "is-active font-medium text-white"
                      : "text-slate-400 hover:bg-slate-800"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="app-nav-icon" aria-hidden="true">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
            <button
              onClick={logout}
              className="app-logout mt-2 flex w-full items-center gap-2 rounded-lg border-t border-slate-800 px-3 py-2.5 text-[13px] text-slate-400"
            >
              Uitloggen
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col pb-16 lg:pb-0 lg:pl-[220px]">
        <main className="app-main flex min-h-0 flex-1 flex-col">
          <header className="app-topbar hidden items-center justify-between px-6 lg:flex">
            <div className="flex items-center gap-2 text-[13px]">
              <span className="text-slate-400">GPS Manager</span>
              <span className="text-slate-300">/</span>
              <span className="font-semibold text-slate-700">{activePage.label}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="app-avatar app-avatar-top">
                {me?.username?.slice(0, 1).toUpperCase() ?? "?"}
              </span>
              <div>
                <p className="text-[12px] font-semibold text-slate-800">{me?.username ?? ""}</p>
                <p className="text-[10px] text-slate-400">{me?.role ?? "Beheerder"}</p>
              </div>
            </div>
          </header>
          <div className="app-content min-h-0 flex-1">{children}</div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="app-bottom-nav fixed inset-x-0 bottom-0 z-[100] flex lg:hidden" aria-label="Mobiele navigatie">
        {MOBILE_NAV.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/app" && pathname.startsWith(item.href + "/"));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`app-bottom-link flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${
                active ? "text-blue-600" : "text-slate-400"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <span className="app-nav-icon text-lg" aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
