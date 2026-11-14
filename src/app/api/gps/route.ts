import { NextResponse } from "next/server";

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

  console.log("[api/gps] Received GPS data:", latestRecord);

  return NextResponse.json({ accepted: true });
}
