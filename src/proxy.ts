// Staff login gate (Next.js 16 "proxy", formerly middleware).
// Everything except the public prospect chat, the two webhooks and /login
// requires a signed staff session cookie. In production, if STAFF_PASSWORD or
// LEASING_SESSION_SECRET is missing the app fails closed (nothing private loads).
import { NextResponse, type NextRequest } from "next/server";
import { authBypassed, authConfig, isPublicPath, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();
  if (authBypassed()) return NextResponse.next(); // local dev without a password set

  const cfg = authConfig();
  if (!cfg.ok) {
    return new NextResponse(`Staff login is not configured: ${cfg.problem}.`, { status: 503 });
  }
  if (await verifySessionToken(cfg.secret, req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) return new NextResponse("Login required", { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
