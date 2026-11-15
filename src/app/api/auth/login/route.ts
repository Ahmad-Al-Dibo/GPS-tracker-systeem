// POST /api/auth/login — email of username + wachtwoord
// Brute-force-bescherming: in-memory rate-limit (5 mislukte pogingen per
// 15 min per IP+identifier, plus 20 per IP alleen) → 429. Zie lib/rate-limit.
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { loginSchema } from "@/lib/validation";
import { createSession } from "@/lib/auth-session";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";
import { createRateLimiter } from "@/lib/rate-limit";

const WINDOW_MS = 15 * 60_000;
const MAX_PER_IDENTIFIER = 5;
const MAX_PER_IP = 20;

const limiter = createRateLimiter(WINDOW_MS);

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  const { identifier, password } = parsed.data;
  const ip = clientIp(req);
  const idKey = `id:${ip}:${identifier.toLowerCase()}`;
  const ipKey = `ip:${ip}`;

  if (limiter.isLimited(idKey, MAX_PER_IDENTIFIER) || limiter.isLimited(ipKey, MAX_PER_IP)) {
    logger.warn("login rate-limited", { ip, identifier });
    return NextResponse.json(
      { error: "Te veel inlogpogingen. Probeer het over 15 minuten opnieuw." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(WINDOW_MS / 1000)) } }
    );
  }

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { username: identifier }] },
  });
  const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;

  if (!user || !valid) {
    limiter.record(idKey);
    limiter.record(ipKey);
    // Nooit het onderscheid loggen tussen "onbekend" en "fout wachtwoord".
    logger.warn("login failed", { ip, identifier });
    await logAudit(null, "auth.login_failed", "user", undefined, { identifier, ip });
    return NextResponse.json(
      { error: "Ongeldige inloggegevens" },
      { status: 401 }
    );
  }

  limiter.clear(idKey);
  limiter.clear(ipKey);

  await createSession(user.id);
  logger.info("login succeeded", { ip, userId: user.id });
  await logAudit(user.id, "auth.login", "user", user.id, { ip });

  return NextResponse.json({
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
  });
}
