import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { startOfMonth, endOfMonth } from "date-fns";
import {
  MAX_ABSENCES_PER_MONTH,
  MAX_ABSENCES_PER_SUNDAY,
} from "@/lib/constants";
import { z } from "zod";

const createAbsenceSchema = z.object({
  scheduleId: z.string().min(1),
  serviceId: z.string().min(1),
  reason: z.string().max(500).nullable().optional(),
  isOverride: z.boolean().optional(),
  adminNote: z.string().max(500).nullable().optional(),
});

// GET /api/absences
// Returns the calling user's absences (kakak) or all absences (admin)
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month"); // format: "2026-03"
  const userId = searchParams.get("userId"); // admin: filter by user

  let dateFilter = {};
  if (month) {
    const [year, m] = month.split("-").map(Number);
    const ref = new Date(year, m - 1, 1);
    dateFilter = { date: { gte: startOfMonth(ref), lte: endOfMonth(ref) } };
  }

  const isAdmin = session!.user.role === "ADMIN";
  const targetUserId =
    isAdmin && userId ? userId : session!.user.id;

  const absences = await prisma.absence.findMany({
    where: {
      ...(isAdmin && !userId ? {} : { userId: targetUserId }),
      schedule: Object.keys(dateFilter).length ? dateFilter : undefined,
    },
    orderBy: { schedule: { date: "asc" } },
    include: {
      schedule: { select: { date: true, title: true } },
      user: isAdmin ? { select: { name: true, email: true } } : false,
    },
  });

  return NextResponse.json(absences);
}

// POST /api/absences  — kakak submits an absence request
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const raw = await req.json();
  const parsed = createAbsenceSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { scheduleId, serviceId, reason, isOverride, adminNote } = parsed.data;

  const [schedule, service] = await Promise.all([
    prisma.schedule.findUnique({ where: { id: scheduleId } }),
    prisma.service.findUnique({ where: { id: serviceId } }),
  ]);
  if (!schedule) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }
  if (schedule.date.getDay() !== 0) {
    return NextResponse.json(
      { error: "Absences can only be submitted for Sunday schedules" },
      { status: 400 }
    );
  }
  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const isAdmin = session!.user.role === "ADMIN";

  // Check for duplicate per (user, schedule, service)
  const existing = await prisma.absence.findUnique({
    where: { userId_scheduleId_serviceId: { userId: session!.user.id, scheduleId, serviceId } },
  });
  if (existing) {
    // If the existing record is active (PENDING/APPROVED), block re-submission
    if (existing.status === "PENDING" || existing.status === "APPROVED") {
      return NextResponse.json(
        { error: "You already have an absence for this service on this Sunday" },
        { status: 409 }
      );
    }
    // If CANCELLED or REJECTED, reactivate the record instead of creating a new one
    const updated = await prisma.absence.update({
      where: { id: existing.id },
      data: {
        status: isAdmin && isOverride ? "APPROVED" : "PENDING",
        reason: reason ?? null,
        adminNote: isAdmin ? (adminNote ?? null) : null,
        isOverride: isAdmin && !!isOverride,
      },
      include: { schedule: { select: { date: true, title: true } } },
    });
    return NextResponse.json(updated, { status: 201 });
  }

  // ── Business rule checks (skipped for admin override) ─────────────────────
  if (!isOverride) {
    const monthStart = startOfMonth(schedule.date);
    const monthEnd = endOfMonth(schedule.date);

    // Monthly limit = distinct Sundays (not per-service count)
    const distinctSundaysAbsent = await prisma.absence.groupBy({
      by: ["scheduleId"],
      where: {
        userId: session!.user.id,
        status: { in: ["APPROVED", "PENDING"] },
        schedule: { date: { gte: monthStart, lte: monthEnd } },
      },
    });
    const personalMonthlyCount = distinctSundaysAbsent.length;

    if (personalMonthlyCount >= MAX_ABSENCES_PER_MONTH && !isAdmin) {
      return NextResponse.json(
        {
          error: `Monthly absence limit (${MAX_ABSENCES_PER_MONTH}) reached`,
          code: "PERSONAL_LIMIT_EXCEEDED",
        },
        { status: 422 }
      );
    }

    // Team limit = distinct kakaks absent on this whole Sunday (all services combined)
    const absentUsersOnSunday = await prisma.absence.findMany({
      distinct: ["userId"],
      where: {
        scheduleId,
        status: { in: ["APPROVED", "PENDING"] },
        userId: { not: session!.user.id },
      },
      select: { userId: true },
    });

    if (absentUsersOnSunday.length >= MAX_ABSENCES_PER_SUNDAY && !isAdmin) {
      return NextResponse.json(
        {
          error: `Team absence limit (${MAX_ABSENCES_PER_SUNDAY}) reached for this Sunday`,
          code: "TEAM_LIMIT_EXCEEDED",
        },
        { status: 422 }
      );
    }
  }

  const absence = await prisma.absence.create({
    data: {
      userId: session!.user.id,
      scheduleId,
      serviceId,
      reason: reason ?? null,
      isOverride: isAdmin && !!isOverride,
      adminNote: isAdmin ? (adminNote ?? null) : null,
      status: isAdmin && isOverride ? "APPROVED" : "PENDING",
    },
    include: { schedule: { select: { date: true, title: true } } },
  });

  // Log admin overrides
  if (isAdmin && isOverride) {
    await prisma.auditLog.create({
      data: {
        userId: session!.user.id,
        action: "OVERRIDE_ABSENCE",
        entityId: absence.id,
        details: { reason, adminNote, scheduleId, serviceId },
      },
    });
  }

  return NextResponse.json(absence, { status: 201 });
}
