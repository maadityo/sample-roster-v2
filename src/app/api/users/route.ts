import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-helpers";
import { startOfMonth, endOfMonth } from "date-fns";
import { MAX_ABSENCES_PER_MONTH } from "@/lib/constants";
import { z } from "zod";

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().max(100).optional(),
  role: z.enum(["KAKAK", "ADMIN"]).optional(),
});

// GET /api/users  (Admin only) — list all kakaks with monthly absence stats
export async function GET(req: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month"); // "2026-03"

  let monthStart: Date, monthEnd: Date;
  if (month) {
    const [year, m] = month.split("-").map(Number);
    monthStart = startOfMonth(new Date(year, m - 1, 1));
    monthEnd = endOfMonth(monthStart);
  } else {
    monthStart = startOfMonth(new Date());
    monthEnd = endOfMonth(new Date());
  }

  const users = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: {
      absences: {
        where: {
          status: { in: ["APPROVED", "PENDING"] },
          schedule: { date: { gte: monthStart, lte: monthEnd } },
        },
        select: { id: true },
      },
    },
  });

  const result = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image,
    role: u.role,
    isActive: u.isActive,
    monthlyAbsenceCount: u.absences.length,
    approachingLimit: u.absences.length >= MAX_ABSENCES_PER_MONTH - 1,
    atLimit: u.absences.length >= MAX_ABSENCES_PER_MONTH,
  }));

  return NextResponse.json(result);
}

// PATCH /api/users/[id] handled in separate file
// POST /api/users — Admin creates/invites a kakak
export async function POST(req: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const raw = await req.json();
  const parsed = createUserSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { email, name, role } = parsed.data;

  const user = await prisma.user.upsert({
    where: { email },
    update: { name: name ?? undefined, role: role ?? undefined },
    create: { email, name: name ?? null, role: role ?? "KAKAK" },
  });

  return NextResponse.json(user, { status: 201 });
}
