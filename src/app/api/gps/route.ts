import { NextResponse } from "next/server";

// DEBUG-ENDPOINT (experimentele Python-listener): bewaart alleen het laatste
// record in memory — GEEN database-write, dus geen productiepad.
// Session-protected via proxy default-deny; payload wordt NIET gelogd
// (locatiegegevens horen niet ongefilterd in stdout).
let latestRecord: unknown = null;

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ record: latestRecord });
}

export async function POST(request: Request) {
  try {
    latestRecord = await request.json();
  } catch {
    return NextResponse.json(
      { accepted: false, error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  return NextResponse.json({ accepted: true });
}
