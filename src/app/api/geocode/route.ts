// GET /api/geocode?q=… — server-side geocoding (Photon + Nominatim fallback)
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { geocode } from "@/lib/geocode";

export async function GET(req: NextRequest) {
  const { res } = await requireAuth();
  if (res) return res;

  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.trim().length < 3) {
    return NextResponse.json({ error: "Query moet minimaal 3 tekens zijn" }, { status: 400 });
  }
  if (q.length > 200) {
    return NextResponse.json({ error: "Query te lang" }, { status: 400 });
  }

  try {
    const { results, provider } = await geocode(q);
    return NextResponse.json({ results, provider });
  } catch (err) {
    // Upstream-tekst (Photon/Nominatim) niet teruggeven aan de client;
    // volledige fout wel server-side zodat debugging mogelijk blijft.
    console.error("[geocode] provider failure:", err);
    return NextResponse.json(
      { error: "Geocoding mislukt — externe dienst tijdelijk niet beschikbaar" },
      { status: 502 }
    );
  }
}
