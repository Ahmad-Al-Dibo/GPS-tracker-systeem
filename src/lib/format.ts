// Gedeelde datum-/tijdformaten (nl-NL).
// Vóór deze module mixte de UI toLocaleString() zonder locale,
// toLocaleString("nl-NL") en toLocaleTimeString() door elkaar — dezelfde
// data werd op verschillende pagina's anders weergegeven.

const NL = "nl-NL";

/** 14-11-2026 15:42 — voor lijsten met datum + tijd. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(NL);
}

/** 15:42 — alleen tijd (bijv. laatste positie). */
export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(NL);
}

/** 14-11-2026 — alleen datum. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(NL);
}
