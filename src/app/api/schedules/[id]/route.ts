import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { startOfDay } from "date-fns";

// PATCH /api/schedules/[id]  (Admin only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  if (session!.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { date, title, notes, isHoliday } = body;

  const existing = await prisma.schedule.findUnique({
    where: { id: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  const updated = await prisma.schedule.update({
    where: { id: params.id },
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
  { params }: { params: { id: string } }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  if (session!.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.schedule.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}
