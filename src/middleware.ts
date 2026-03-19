import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that don't require authentication
const publicPaths = ["/login", "/api/auth"];

export default auth(function middleware(req: NextRequest & { auth: any }) {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Require authentication for all other routes
  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Route non-admin users away from /admin paths
  if (pathname.startsWith("/admin") && req.auth.user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-|manifest).*)"],
};
