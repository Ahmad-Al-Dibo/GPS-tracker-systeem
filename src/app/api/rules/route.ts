// Rules API: GET (lijst) + POST (aanmaken)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const conditionSchema = z.object({
  field: z.enum(["speed_kmh", "latitude", "longitude", "last_seen_age_s", "hour_of_day", "day_of_week"]),
  operator: z.enum(["gt", "gte", "lt", "lte", "eq", "neq", "between", "outside_hours", "outside_days", "enters_geofence", "leaves_geofence"]),
  value1: z.number().nullable().optional(),
  value2: z.number().nullable().optional(),
});

const ruleCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  enabled: z.boolean().default(true),
  logic: z.enum(["single", "and_all", "or_any"]).default("single"),
  severity: z.enum(["info", "warning", "critical"]).default("warning"),
  vehicleGroup: z.string().trim().max(60).nullable().optional(),
  vehicleIds: z.array(z.string().uuid()).default([]),
  thresholdValue: z.number().nullable().optional(),
  thresholdMin: z.number().nullable().optional(),
  thresholdMax: z.number().nullable().optional(),
  durationSec: z.number().int().min(1).nullable().optional(),
  consecutive: z.number().int().min(1).nullable().optional(),
  timezone: z.string().default("Europe/Amsterdam"),
  weekdays: z.array(z.number().int().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]),
  timeFrom: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  timeTo: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  geofenceId: z.string().uuid().nullable().optional(),
  preEventPoints: z.number().int().min(0).max(100).default(10),
  postEventPoints: z.number().int().min(0).max(50).default(5),
  retentionDays: z.number().int().min(1).max(365).default(30),
  notifyInApp: z.boolean().default(true),
  createEvent: z.boolean().default(true),
  createTask: z.boolean().default(false),
  taskTitle: z.string().trim().max(200).nullable().optional(),
  conditions: z.array(conditionSchema).default([]),
});

export async function GET() {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const rules = await prisma.rule.findMany({
    include: { conditions: true, geofence: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    rules: rules.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const { auth, res } = await requireAdmin();
  if (res) return res;

  const body = await req.json().catch(() => null);
  const parsed = ruleCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ongeldige invoer", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const { conditions, ...ruleData } = d;

  const rule = await prisma.rule.create({
    data: {
      ...ruleData,
      conditions: {
        create: conditions.map((c) => ({
          field: c.field,
          operator: c.operator,
          value1: c.value1,
          value2: c.value2,
        })),
      },
    },
    include: { conditions: true },
  });

  await logAudit(auth.user.id, "rule.created", "rule", rule.id, { name: rule.name });

  return NextResponse.json(
    {
      ...rule,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    },
    { status: 201 }
  );
}
