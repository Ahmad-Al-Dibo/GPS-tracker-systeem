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
  { href: "/app/trackers", label: "Trackers", icon: "📡" },
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

  const loadMe = useCallback(async () => {
    const res = await fetch("/api/me");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (res.ok) setMe(await res.json());
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  // Sluit menu bij navigatie
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f8fafc]">
        <div className="text-slate-400">Laden…</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#f8fafc]">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-[100] hidden w-[220px] flex-col bg-[#0f172a] lg:flex">
        <div className="flex items-center gap-2.5 border-b border-slate-800 px-4 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm text-white">📍</span>
          <div>
            <p className="text-[13px] font-bold text-white">GPS Manager</p>
            <p className="text-[11px] text-slate-400">Beheerder</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-3">
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/app" && pathname.startsWith(item.href + "/"));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                  active
                    ? "bg-blue-600/20 font-medium text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                <span className="text-[15px]">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 px-3 py-3">
          <p className="mb-1.5 truncate text-[11px] text-slate-500">
            {me?.username ?? ""}
          </p>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            ↩ Uitloggen
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="fixed inset-x-0 top-0 z-[100] flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-xs text-white">📍</span>
          <span className="text-sm font-bold">GPS Manager</span>
        </div>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Menu"
        >
          {menuOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* Mobile menu overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-[99] lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-14 w-64 rounded-l-xl bg-[#0f172a] p-3 shadow-xl">
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
                  className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] ${
                    active
                      ? "bg-blue-600/20 font-medium text-white"
                      : "text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
            <button
              onClick={logout}
              className="mt-2 flex w-full items-center gap-2 rounded-lg border-t border-slate-800 px-3 py-2.5 text-[13px] text-slate-400"
            >
              ↩ Uitloggen
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col pb-16 lg:pb-0 lg:pl-[220px]">
        <main className="min-h-0 flex-1">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-[100] flex border-t border-slate-200 bg-white lg:hidden">
        {MOBILE_NAV.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/app" && pathname.startsWith(item.href + "/"));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${
                active ? "text-blue-600" : "text-slate-400"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
