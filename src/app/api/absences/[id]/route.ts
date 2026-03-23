import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

const patchAbsenceSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "CANCELLED"]).optional(),
  reason: z.string().max(500).optional(),
  adminNote: z.string().max(500).optional(),
});

// PATCH /api/absences/[id]
// Kakak: can cancel their own pending absence
// Admin: can approve/reject, update reason, add adminNote
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { session, error } = await requireAuth();
  if (error) return error;

  const absence = await prisma.absence.findUnique({
    where: { id },
  });
  if (!absence) {
    return NextResponse.json({ error: "Absence not found" }, { status: 404 });
  }

  const isAdmin = session!.user.role === "ADMIN";
  const isOwner = absence.userId === session!.user.id;

  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = await req.json();
  const parsed = patchAbsenceSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const body = parsed.data;

  if (!isAdmin) {
    // Kakak may only cancel their own PENDING absence
    if (body.status && body.status !== "CANCELLED") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (absence.status !== "PENDING" && body.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Only PENDING absences can be cancelled" },
        { status: 422 }
      );
    }
  }

  const updated = await prisma.absence.update({
    where: { id },
    data: {
      status: body.status ?? undefined,
      reason: body.reason !== undefined ? body.reason : undefined,
      adminNote: isAdmin && body.adminNote !== undefined ? body.adminNote : undefined,
    },
  });

  if (isAdmin && body.status) {
    await prisma.auditLog.create({
      data: {
        userId: session!.user.id,
        action: `${body.status}_ABSENCE`,
        entityId: absence.id,
        details: { adminNote: body.adminNote },
      },
    });
  }

  return NextResponse.json(updated);
}

// DELETE /api/absences/[id]  (Admin only)
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

  await prisma.absence.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
