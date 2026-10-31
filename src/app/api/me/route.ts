// GET /api/me — huidige gebruiker
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth-session";

export async function GET() {
  const auth = await getAuth();
  if (!auth) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  return NextResponse.json(auth.user);
}
