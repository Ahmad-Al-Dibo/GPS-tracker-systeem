// API-key service: genereren, hashen, valideren
// Best practice: nooit raw key opslaan — alleen SHA-256 hash + prefix
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";

export const API_KEY_PREFIX = "gpta_";

/** Genereert een nieuwe raw API-key (alleen 1× zichtbaar voor de gebruiker). */
export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = API_KEY_PREFIX + randomBytes(24).toString("hex");
  const hash = sha256(raw);
  const prefix = raw.slice(0, API_KEY_PREFIX.length + 6) + "…";
  return { raw, hash, prefix };
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Zoekt een actieve key op hash; updated last_used_at. */
export async function validateApiKey(rawKey: string) {
  if (!rawKey || !rawKey.startsWith(API_KEY_PREFIX)) return null;
  const keyHash = sha256(rawKey);

  const key = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { user: true },
  });

  if (!key || !key.isActive || key.revokedAt) return null;

  // Fire-and-forget last_used_at
  prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return key;
}
