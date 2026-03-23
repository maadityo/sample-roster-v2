import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { startOfDay } from "date-fns";
import { z } from "zod";

const patchScheduleSchema = z.object({
  date: z.string().optional(),
  title: z.string().max(200).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  isHoliday: z.boolean().optional(),
});

// PATCH /api/schedules/[id]  (Admin only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { session, error } = await requireAuth();
  if (error) return error;
  if (session!.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = await req.json();
  const parsed = patchScheduleSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { date, title, notes, isHoliday } = parsed.data;

  const existing = await prisma.schedule.findUnique({
    where: { id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  const updated = await prisma.schedule.update({
    where: { id },
    data: {
      date: date ? startOfDay(new Date(date)) : undefined,
      title: title !== undefined ? title : undefined,
      notes: notes !== undefined ? notes : undefined,
      isHoliday: isHoliday !== undefined ? isHoliday : undefined,
    },
  });

  return NextResponse.json(updated);
}

// DELETE /api/schedules/[id]  (Admin only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { session, error } = await requireAuth();
  if (error) return error;
  if (session!.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.schedule.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
