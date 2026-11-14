// Config — centrale configuratie, env-gedreven (defaults gelijk aan vorig gedrag).

// --- Tracking state drempels (zie .env.example) -------------------------------
/** GPS-data wordt als "vers" gezien binnen dit venster na laatste record. */
export const FRESH_ONLINE_S = Number(process.env.FRESH_ONLINE_S ?? 120);
/** OFFLINE na deze tijd; daartussen stale (laatste positie nog zichtbaar). */
export const FRESH_OFFLINE_S = Number(process.env.FRESH_OFFLINE_S ?? 900);
/** Hardware-apparaten sturen periodiek batches → ruimere verbindingsvensters. */
export const DEVICE_ONLINE_S = Number(process.env.DEVICE_ONLINE_S ?? 7200);
export const DEVICE_OFFLINE_S = Number(process.env.DEVICE_OFFLINE_S ?? 21600);

// --- Legacy (nog in gebruik door presence.ts / oude routes) -------------------
export const OFFLINE_AFTER_MS = 75_000;
export const HEARTBEAT_INTERVAL_MS = 20_000;
export const STALE_MS = 90_000;
