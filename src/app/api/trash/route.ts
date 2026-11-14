// GET /api/trash?type=persons|vehicles — prullenbak (verwijderde records)
// Gesorteerd op verwijderdatum, nieuwste eerst; met verwijderdoor + afhankelijkheden.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "persons";

  if (type === "vehicles") {
    const vehicles = await prisma.ingestSource.findMany({
      where: {
        deletedAt: { not: null },
        // Multi-tenancy: admin alles, gebruiker alleen eigen verwijderde voertuigen
        ...(auth!.user.role === "admin" ? {} : { ownerUserId: auth!.user.id }),
      },
      include: {
        deletedByUser: { select: { username: true } },
        _count: { select: { points: true, events: true, tasks: true, persons: true } },
      },
      orderBy: { deletedAt: "desc" },
    });

    return NextResponse.json({
      type: "vehicles",
      items: vehicles.map((v) => ({
        id: v.id,
        name: v.displayName ?? v.name,
        internalName: v.name,
        licensePlate: v.licensePlate,
        vehicleGroup: v.vehicleGroup,
        isActive: v.isActive,
        deletedAt: v.deletedAt!.toISOString(),
        deletedBy: v.deletedBy,
        deletedByName: v.deletedByUser?.username ?? null,
        dependencies: {
          gpsPoints: v._count.points,
          events: v._count.events,
          tasks: v._count.tasks,
          links: v._count.persons,
        },
      })),
    });
  }

  if (type === "persons") {
    const persons = await prisma.person.findMany({
      where: { deletedAt: { not: null } },
      include: {
        deletedByUser: { select: { username: true } },
        _count: { select: { vehicles: true } },
      },
      orderBy: { deletedAt: "desc" },
    });

    return NextResponse.json({
      type: "persons",
      items: persons.map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        city: p.city,
        deletedAt: p.deletedAt!.toISOString(),
        deletedBy: p.deletedBy,
        deletedByName: p.deletedByUser?.username ?? null,
        dependencies: { links: p._count.vehicles },
      })),
    });
  }

  return NextResponse.json({ error: "type moet 'persons' of 'vehicles' zijn" }, { status: 400 });
}
