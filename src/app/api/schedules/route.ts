import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { startOfDay, addDays } from "date-fns";
import { z } from "zod";

const createScheduleSchema = z.object({
  date: z.string().min(1),
  title: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  isHoliday: z.boolean().optional(),
});

// GET /api/schedules
// Kakaks: see upcoming Sundays with their own absence status
// Admins: see all schedules (optionally filtered)
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = Number(searchParams.get("limit") ?? 20);

  const fromDate = from ? new Date(from) : startOfDay(new Date());
  const toDate = to ? new Date(to) : addDays(fromDate, 90);

  const schedules = await prisma.schedule.findMany({
    where: { date: { gte: fromDate, lte: toDate } },
    orderBy: { date: "asc" },
    take: limit,
    include: {
      _count: {
        select: {
          absences: { where: { status: { in: ["APPROVED", "PENDING"] } } },
        },
      },
      absences: {
        where: { userId: session!.user.id },
        select: { status: true },
      },
    },
  });

  const result = schedules.map((s) => ({
    id: s.id,
    date: s.date,
    title: s.title,
    notes: s.notes,
    isHoliday: s.isHoliday,
    absenceCount: s._count.absences,
    myAbsence: s.absences[0]?.status ?? null,
  }));

  return NextResponse.json(result);
}

// POST /api/schedules  (Admin only)
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  if (session!.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = await req.json();
  const parsed = createScheduleSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { date, title, notes, isHoliday } = parsed.data;

  const parsedDate = startOfDay(new Date(date));
  if (isNaN(parsedDate.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const schedule = await prisma.schedule.create({
    data: {
      date: parsedDate,
      title: title ?? null,
      notes: notes ?? null,
      isHoliday: isHoliday ?? false,
    },
  });

  return NextResponse.json(schedule, { status: 201 });
}
