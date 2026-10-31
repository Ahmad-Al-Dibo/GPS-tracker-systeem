// POST /api/auth/logout
import { NextResponse } from "next/server";
import { getAuth, revokeSession } from "@/lib/auth-session";

export async function POST() {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ ok: true });
  await revokeSession(auth.sessionId);
  return NextResponse.json({ ok: true });
}
