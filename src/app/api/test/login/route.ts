/**
 * Test-only login endpoint.
 * Enabled ONLY when NEXTAUTH_TEST_MODE=true — never runs in production.
 *
 * Called by Playwright's auth.setup.ts to bypass Google OAuth.
 * Creates a valid NextAuth JWT session cookie for the specified test user.
 */
import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  role: z.enum(["KAKAK", "ADMIN"]).default("KAKAK"),
});

export async function POST(req: NextRequest) {
  // Safety gate — never allow in production
  if (process.env.NEXTAUTH_TEST_MODE !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  }
  const { email, role } = parsed.data;

  // Find or create the test user
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: { email, name: email.split("@")[0], role },
    });
  }

  // Encode a NextAuth JWT token (same format as prod).
  // NextAuth v5 requires `salt` = the cookie name so the token is bound to it.
  const secret = process.env.NEXTAUTH_SECRET!;
  const salt = "authjs.session-token"; // NextAuth v5 default cookie name
  const token = await encode({
    salt,
    secret,
    token: {
      sub: user.id,
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24h
    },
  });

  // Return the JWT so Playwright can set it as a cookie
  return NextResponse.json({ token, userId: user.id });
}
