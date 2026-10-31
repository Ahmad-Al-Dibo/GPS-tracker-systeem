// Auth-helpers: DB-sessie in httpOnly cookie
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "gps_session_id";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 uur

export type AuthUser = {
  id: string;
  email: string;
  username: string;
  role: "user" | "admin";
};

export type AuthContext = {
  user: AuthUser;
  sessionId: string;
};

export async function createSession(userId: string): Promise<void> {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.deleteMany({ where: { userId } });
  await prisma.session.create({
    data: { id: sessionId, userId, expiresAt, lastHeartbeatAt: new Date() },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getAuth(): Promise<AuthContext | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      username: session.user.username,
      role: session.user.role,
    },
    sessionId: session.id,
  };
}
