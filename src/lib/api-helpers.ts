import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

/** Returns the current authenticated session or throws a 401 response */
export async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      session: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  // Validate that the user ID in the JWT still exists in the DB.
  // A stale JWT (e.g. after a DB reset) would otherwise cause FK constraint
  // errors deep inside API handlers with no helpful error message.
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });
  if (!dbUser) {
    return {
      session: null,
      error: NextResponse.json(
        { error: "Sesi tidak valid. Silakan logout dan login kembali." },
        { status: 401 }
      ),
    };
  }
  return { session, error: null };
}

/** Returns the current session only if the user is an Admin */
export async function requireAdmin() {
  const { session, error } = await requireAuth();
  if (error || !session) return { session: null, error };
  if (session.user.role !== Role.ADMIN) {
    return {
      session: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { session, error: null };
}
