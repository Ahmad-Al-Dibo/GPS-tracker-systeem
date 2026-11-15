// JSON-responses + auth-guards voor API-routes
import { NextResponse } from "next/server";
import type { IngestSource } from "@prisma/client";
import { getAuth, type AuthContext } from "@/lib/auth-session";
import { prisma } from "@/lib/db";

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

/** Vereist sessie + beheer op een tracker (admin óf eigenaar) en geeft de
 * tracker-rij mee — dezelfde regel voor elke tracker-route (geen IDOR). */
export async function requireTrackerAccess(trackerId: string): Promise<
  | { auth: AuthContext; source: IngestSource; res?: undefined }
  | { auth?: undefined; source?: undefined; res: NextResponse }
> {
  const result = await requireAuth();
  if (result.res) return { res: result.res };
  const auth = result.auth!;
  const source = await prisma.ingestSource.findUnique({ where: { id: trackerId } });
  if (!source || source.deletedAt) {
    return { res: jsonError("Niet gevonden", 404) };
  }
  if (auth.user.role !== "admin" && source.ownerUserId !== auth.user.id) {
    return { res: jsonError("Geen toegang", 403) };
  }
  return { auth, source };
}
