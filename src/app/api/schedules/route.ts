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

  const [schedules, churches] = await Promise.all([
    prisma.schedule.findMany({
      where: { date: { gte: fromDate, lte: toDate } },
      orderBy: { date: "asc" },
      take: limit,
      include: {
        absences: {
          where: { status: { in: ["APPROVED", "PENDING"] } },
          select: { userId: true, serviceId: true, status: true, id: true },
        },
      },
    }),
    prisma.church.findMany({
      orderBy: { sortOrder: "asc" },
      include: { services: { orderBy: { sortOrder: "asc" } } },
    }),
  ]);

  const userId = session!.user.id;

  const result = schedules.map((s) => {
    // Build per-service maps
    const teamCountByService = new Map<string, number>();
    const myAbsenceByService = new Map<string, { id: string; status: string }>();
    for (const a of s.absences) {
      teamCountByService.set(a.serviceId, (teamCountByService.get(a.serviceId) ?? 0) + 1);
      if (a.userId === userId) {
        myAbsenceByService.set(a.serviceId, { id: a.id, status: a.status });
      }
    }

    return {
      id: s.id,
      date: s.date,
      title: s.title,
      notes: s.notes,
      isHoliday: s.isHoliday,
      churches: churches.map((c) => ({
        id: c.id,
        name: c.name,
        services: c.services.map((svc) => ({
          id: svc.id,
          time: svc.time,
          name: svc.name,
          absenceCount: teamCountByService.get(svc.id) ?? 0,
          myAbsence: myAbsenceByService.get(svc.id)?.status ?? null,
          myAbsenceId: myAbsenceByService.get(svc.id)?.id ?? null,
        })),
      })),
    };
  });

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
