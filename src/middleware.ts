import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Gunakan auth.config.ts yang Edge-compatible (tanpa Prisma/Node.js APIs)
const { auth } = NextAuth(authConfig);

// Routes yang tidak butuh authentication
const publicPaths = [
  "/login",
  "/api/auth",
  // Test-only login route (gated by NEXTAUTH_TEST_MODE=true inside the handler)
  "/api/test/login",
];

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
