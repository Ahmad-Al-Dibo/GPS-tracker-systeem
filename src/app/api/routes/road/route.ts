// POST /api/routes/road — straatroute tussen punten via OSRM (openbare demo)
// Valt terug op null (client toont rechte lijn + melding) bij falen.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { fetchRoadRoute } from "@/lib/geocode";
import { z } from "zod";

const roadSchema = z.object({
  points: z
    .array(
      z.object({
        latitude: z.number().finite().min(-90).max(90),
        longitude: z.number().finite().min(-180).max(180),
      })
    )
    .min(2)
    .max(50),
});

export async function POST(req: NextRequest) {
  const { res } = await requireAuth();
  if (res) return res;

  const body = await req.json().catch(() => null);
  const parsed = roadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Minimaal 2 en maximaal 50 punten vereist" },
      { status: 400 }
    );
  }

  const coords = parsed.data.points.map(
    (p) => [p.latitude, p.longitude] as [number, number]
  );
  const route = await fetchRoadRoute(coords);
  if (!route) {
    return NextResponse.json(
      {
        error:
          "Straatroute niet beschikbaar (OSRM-demo onbereikbaar of te lang) — gebruik de rechte lijn als fallback.",
      },
      { status: 503 }
    );
  }
  return NextResponse.json({ route });
}
