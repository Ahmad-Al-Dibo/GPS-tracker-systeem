// JSON-responses + auth-guards voor API-routes
import { NextResponse } from "next/server";
import { getAuth, type AuthContext } from "@/lib/auth-session";

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Vereist ingelogde gebruiker. */
export async function requireAuth(): Promise<
  { auth: AuthContext; res?: undefined } | { auth?: undefined; res: NextResponse }
> {
  const auth = await getAuth();
  if (!auth) {
    return { res: jsonError("Niet ingelogd", 401) };
  }
  return { auth };
}

/** Vereist admin. */
export async function requireAdmin(): Promise<
  { auth: AuthContext; res?: undefined } | { auth?: undefined; res: NextResponse }
> {
  const result = await requireAuth();
  if (result.res) return result;
  if (result.auth!.user.role !== "admin") {
    return { res: jsonError("Alleen admins", 403) };
  }
  return { auth: result.auth! };
}
