// API-keys endpoints (ingelogde gebruiker)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { generateApiKey } from "@/lib/api-keys";
import { apiKeyCreateSchema } from "@/lib/validation";

/** GET /api/keys — eigen keys (zonder raw values) */
export async function GET() {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const keys = await prisma.apiKey.findMany({
    where: { userId: auth.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      keyPrefix: true,
      label: true,
      isActive: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
  });

  return NextResponse.json({
    keys: keys.map((k) => ({
      ...k,
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      revokedAt: k.revokedAt?.toISOString() ?? null,
    })),
  });
}

/** POST /api/keys — nieuwe key; raw wordt 1× geretourneerd */
export async function POST(req: NextRequest) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const body = await req.json().catch(() => ({}));
  const parsed = apiKeyCreateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  const { raw, hash, prefix } = generateApiKey();

  const key = await prisma.apiKey.create({
    data: {
      userId: auth.user.id,
      keyHash: hash,
      keyPrefix: prefix,
      label: parsed.data.label,
    },
    select: { id: true, keyPrefix: true, label: true, createdAt: true },
  });

  // Raw key alleen nu tonen — daarna nooit meer
  return NextResponse.json(
    {
      id: key.id,
      label: key.label,
      keyPrefix: key.keyPrefix,
      createdAt: key.createdAt.toISOString(),
      apiKey: raw,
      warning: "Kopieer deze key nu — daarna is hij niet meer te zien.",
    },
    { status: 201 }
  );
}

/** DELETE /api/keys/[id] — intrekken (in route [id]) */
