// Gedeelde HTTP-helper voor pagina's.
// Vóór deze module herhaalde elke save()-functie dezelfde fetch + json +
// fout-extractie ("data?.error ?? Fout ${status}") + catch → "Netwerkfout".
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Fetch + JSON + foutafhandeling in één aanroep.
 * Gooit nooit: netwerkfouten worden { ok:false, error:"Netwerkfout" }. */
export async function apiRequest<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, init);
    const data = (await res.json().catch(() => null)) as
      | (T & { error?: string })
      | null;
    if (!res.ok) {
      return { ok: false, error: data?.error ?? `Fout ${res.status}` };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "Netwerkfout" };
  }
}

/** Gemakkelijke POST/PATCH/DELETE met JSON-body. */
export function jsonRequest(
  method: "POST" | "PATCH" | "DELETE" | "PUT",
  body: unknown
): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
