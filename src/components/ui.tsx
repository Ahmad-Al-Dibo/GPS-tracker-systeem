"use client";

// Gedeelde UI-primitieven voor de fleet-pagina's.
// Deze patronen stonden voorheen als kopie in ~10-12 pagina's (identieke
// error-banner, input-class strings, table-head strings). Eén definitie =
// consistente styling en één plek om aan te passen.
import type { ReactNode } from "react";

/** Rode foutmelding onder de paginakop. */
export function ErrorBanner({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
      {children}
    </p>
  );
}

/** Standaard input/textarea/select-styling voor formulieren. */
export const fieldClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-100";

/** Standaard tabel-head-cel. */
export const thClass =
  "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";

/** Standaard tabel-rijcel. */
export const tdClass = "px-3 py-2 text-sm text-slate-700";

/** Primair actie-knop (opslaan/toevoegen). */
export const primaryButtonClass =
  "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50";

/** Formulier-opslaan-knop met busy-state. */
export function SaveButton({
  saving,
  label = "Opslaan",
  busyLabel = "Bezig…",
}: {
  saving: boolean;
  label?: string;
  busyLabel?: string;
}) {
  return (
    <button
      type="submit"
      disabled={saving}
      className={primaryButtonClass}
    >
      {saving ? busyLabel : label}
    </button>
  );
}
