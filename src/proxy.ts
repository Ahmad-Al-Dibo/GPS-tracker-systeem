// Route-guard: sessie → app; publiek: home/login/api/auth
// Publieke registratie is verwijderd — alleen admin-account via seed.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth-session";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const sessionId = req.cookies.get(SESSION_COOKIE)?.value;

  const isPublic =
    pathname === "/" ||
    pathname === "/login" ||
    pathname.startsWith("/api/auth");

  if (isPublic) return NextResponse.next(); // 

  if (!sessionId) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
    }
    const url = new URL("/login", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sessie verlopen" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // /app/users alleen admin
  if (pathname.startsWith("/app/users") && session.user.role !== "admin") {
    return NextResponse.redirect(new URL("/app", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/app/:path*",
    "/dashboard/:path*",
    "/api/keys/:path*",
    "/api/ingest/sources/:path*",
    "/api/me",
    "/api/overview",
    "/api/rules/:path*",
    "/api/events/:path*",
    "/api/geofences/:path*",
    "/api/tasks/:path*",
    "/api/settings",
    "/api/users",
    "/api/notifications",
    "/api/reports",
  ],
};
