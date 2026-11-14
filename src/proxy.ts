// Route-guard: sessie → app; default-deny voor /api/* met expliciete
// publieke uitzonderingen (zie isPublic hieronder).
// Publieke registratie is verwijderd — alleen admin-account via seed.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth-session";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const sessionId = req.cookies.get(SESSION_COOKIE)?.value;

  // Default-deny: alles is beschermd behalve deze expliciete lijst.
  // Bewust klein — nieuwe routes zijn daarmee direct afgeschermd
  // (defence-in-depth; handlers blijven hun eigen requireAuth draaien).
  const isPublic =
    pathname === "/" ||
    pathname === "/login" ||
    // Sessieloos: login/logout (eigen validatie)
    pathname.startsWith("/api/auth") ||
    // Machine-tot-machine: eigen key-auth in de handler
    pathname === "/api/ingest" ||
    pathname.startsWith("/api/ingest/teltonika") ||
    // Healthchecks moeten onbeantwoord blijven voor load balancers
    pathname.startsWith("/api/health");

  if (isPublic) return NextResponse.next();

  if (!sessionId) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
    }
    const url = new URL("/login", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  let session;
  try {
    session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
  } catch (err) {
    // DB-fout: veiligste optie is toegang weigeren (sessie niet verifiëerbaar)
    console.error(
      "[proxy] Sessie-validatie mislukt:",
      err instanceof Error ? err.message : String(err)
    );
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Serverfout" }, { status: 500 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

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
  matcher: ["/app/:path*", "/dashboard/:path*", "/api/:path*"],
};
