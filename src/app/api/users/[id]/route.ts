import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-helpers";
import { z } from "zod";

const patchUserSchema = z.object({
  name: z.string().max(100).optional(),
  role: z.enum(["KAKAK", "ADMIN"]).optional(),
  isActive: z.boolean().optional(),
});

// PATCH /api/users/[id]  (Admin only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const raw = await req.json();
  const parsed = patchUserSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { name, role, isActive } = parsed.data;

  const user = await prisma.user.update({
    where: { id: params.id },
    data: {
      name: name !== undefined ? name : undefined,
      role: role !== undefined ? role : undefined,
      isActive: isActive !== undefined ? isActive : undefined,
    },
  });

  return NextResponse.json(user);
}
