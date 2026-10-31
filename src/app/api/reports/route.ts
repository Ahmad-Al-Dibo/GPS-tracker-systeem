// Reports API: professioneel export systeem
// - CSV-download (standaard) en JSON-preview (?format=json) voor de UI
// - Rapporttypes: events, activity, availability, distances, tasks
// - Datumfilter van/to op de relevante velden; soft delete gefilterd
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";

type ReportRow = Record<string, string | number | null>;

type ReportDef = {
  title: string;
  columns: string[];
  build: (from?: string, to?: string) => Promise<ReportRow[]>;
  /** Veld voor van/to-datumfilter (alleen voor stats/preview) */
  dateField?: string;
};

export async function GET(req: NextRequest) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "events";
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const format = url.searchParams.get("format") ?? "csv";
  const isAdmin = auth.user.role === "admin";
  const ownerFilter = isAdmin ? {} : { ownerUserId: auth.user.id };

  const dateFilter = (field: string) => {
    if (!from && !to) return {} as Record<string, unknown>;
    return {
      [field]: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      },
    };
  };

  const reports: Record<string, ReportDef> = {
    // 1. Regel-overtredingen
    events: {
      title: "Regel-overtredingen",
      columns: [
        "Voertuig",
        "Regel",
        "Ernst",
        "Status",
        "Start",
        "Einde",
        "Duur(s)",
        "Gemeten",
        "Drempel",
        "Lat",
        "Lon",
      ],
      build: async () => {
        const events = await prisma.event.findMany({
          where: {
            ...dateFilter("startTime"),
            vehicle: { deletedAt: null, ...ownerFilter },
          },
          include: {
            rule: { select: { name: true } },
            vehicle: { select: { name: true, displayName: true } },
          },
          orderBy: { startTime: "desc" },
        });
        return events.map((e) => ({
          Voertuig: e.vehicle.displayName ?? e.vehicle.name,
          Regel: e.rule.name,
          Ernst: e.severity,
          Status: e.status,
          Start: e.startTime.toISOString(),
          Einde: e.endTime?.toISOString() ?? "",
          "Duur(s)": e.durationSec ?? "",
          Gemeten: e.measuredValue ?? "",
          Drempel: e.threshold ?? "",
          Lat: e.latitude ?? "",
          Lon: e.longitude ?? "",
        }));
      },
    },

    // 2. Voertuigactiviteit
    activity: {
      title: "Voertuigactiviteit",
      columns: [
        "Voertuig",
        "Groep",
        "Kenteken",
        "LaatsteLat",
        "LaatsteLon",
        "SnelheidKmh",
        "LaatstGezien",
        "Status",
      ],
      build: async () => {
        const sources = await prisma.ingestSource.findMany({
          where: { deletedAt: null, ...ownerFilter },
          orderBy: { name: "asc" },
        });
        const now = Date.now();
        return sources.map((s) => {
          const age = now - s.receivedAt.getTime();
          const status =
            s.latitude == null ? "no_fix" : age > 120_000 ? "offline" : "online";
          return {
            Voertuig: s.displayName ?? s.name,
            Groep: s.vehicleGroup ?? "",
            Kenteken: s.licensePlate ?? "",
            LaatsteLat: s.latitude ?? "",
            LaatsteLon: s.longitude ?? "",
            SnelheidKmh: s.speedMps != null ? (s.speedMps * 3.6).toFixed(1) : "",
            LaatstGezien: s.receivedAt.toISOString(),
            Status: status,
          };
        });
      },
    },

    // 3. Tracker-beschikbaarheid
    availability: {
      title: "Tracker-beschikbaarheid",
      columns: ["Voertuig", "Bron", "LaatstGezien", "Leeftijd(s)", "GPS-punten"],
      build: async () => {
        const sources = await prisma.ingestSource.findMany({
          where: { deletedAt: null, ...ownerFilter },
          orderBy: { name: "asc" },
        });
        const now = Date.now();
        const rows: ReportRow[] = [];
        for (const s of sources) {
          const pointCount = await prisma.ingestPoint.count({
            where: { sourceId: s.id },
          });
          rows.push({
            Voertuig: s.displayName ?? s.name,
            Bron: s.trackerSource ?? "app",
            LaatstGezien: s.receivedAt.toISOString(),
            "Leeftijd(s)": Math.floor((now - s.receivedAt.getTime()) / 1000),
            "GPS-punten": pointCount,
          });
        }
        return rows;
      },
    },

    // 4. Kilometerstanden
    distances: {
      title: "Kilometerstanden",
      columns: [
        "Voertuig",
        "Kenteken",
        "StartKm",
        "HuidigeKm",
        "TotaalGeredenKm",
        "LaatsteBerekening",
      ],
      build: async () => {
        const sources = await prisma.ingestSource.findMany({
          where: { deletedAt: null, ...ownerFilter },
          orderBy: { name: "asc" },
        });
        return sources.map((s) => ({
          Voertuig: s.displayName ?? s.name,
          Kenteken: s.licensePlate ?? "",
          StartKm: s.startingKm != null ? s.startingKm.toFixed(1) : "",
          HuidigeKm: s.currentKm != null ? s.currentKm.toFixed(1) : "",
          TotaalGeredenKm:
            s.totalDistanceKm != null ? s.totalDistanceKm.toFixed(2) : "",
          LaatsteBerekening: s.lastCalcAt?.toISOString() ?? "",
        }));
      },
    },

    // 5. Taken
    tasks: {
      title: "Takenoverzicht",
      columns: [
        "Titel",
        "Status",
        "Prioriteit",
        "Voertuig",
        "ToegewezenAan",
        "AangemaaktDoor",
        "Vervaldatum",
        "TeLaat",
        "AangemaaktOp",
        "AfgerondOp",
      ],
      build: async () => {
        const tasks = await prisma.task.findMany({
          where: {
            ...dateFilter("createdAt"),
            ...(isAdmin
              ? {}
              : {
                  OR: [{ assigneeId: auth.user.id }, { creatorId: auth.user.id }],
                }),
          },
          include: {
            vehicle: { select: { name: true, displayName: true } },
            assignee: { select: { username: true } },
            creator: { select: { username: true } },
          },
          orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
        });
        const now = Date.now();
        return tasks.map((t) => ({
          Titel: t.title,
          Status: t.status,
          Prioriteit: t.priority,
          Voertuig: t.vehicle ? t.vehicle.displayName ?? t.vehicle.name : "",
          ToegewezenAan: t.assignee?.username ?? "",
          AangemaaktDoor: t.creator.username,
          Vervaldatum: t.dueDate?.toISOString() ?? "",
          TeLaat:
            t.status === "overdue" ||
            (t.dueDate != null && t.dueDate.getTime() < now && ["open", "in_progress"].includes(t.status))
              ? "ja"
              : "nee",
          AangemaaktOp: t.createdAt.toISOString(),
          AfgerondOp: t.completedAt?.toISOString() ?? "",
        }));
      },
    },
  };

  const report = reports[type];
  if (!report) {
    return NextResponse.json(
      {
        error: "Onbekend rapporttype",
        available: Object.keys(reports),
      },
      { status: 400 }
    );
  }

  let rows: ReportRow[];
  try {
    rows = await report.build(from, to);
  } catch (err) {
    console.error("Report build failed:", err);
    return NextResponse.json({ error: "Rapport genereren mislukt" }, { status: 500 });
  }

  // JSON-preview voor de UI (tabel + statistieken)
  if (format === "json") {
    return NextResponse.json({
      type,
      title: report.title,
      columns: report.columns,
      total: rows.length,
      from: from ?? null,
      to: to ?? null,
      generatedAt: new Date().toISOString(),
      rows: rows.slice(0, 200),
      truncated: rows.length > 200,
    });
  }

  // CSV (met BOM; formule-injectiebeveiliging: cellen die beginnen met
  // =, +, - of @ krijgen een voorafgaande apostrof — CSV-injection-bescherming)
  const sanitizeCell = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
  const header = report.columns.map(sanitizeCell).join(";");
  const csvRows = rows.map((r) =>
    report.columns
      .map((c) => {
        const v = r[c];
        const s = sanitizeCell(v == null ? "" : String(v));
        return s.includes(";") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      })
      .join(";")
  );
  const csv = "\uFEFF" + [header, ...csvRows].join("\r\n") + "\r\n";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rapport-${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
