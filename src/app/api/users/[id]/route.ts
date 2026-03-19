import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-helpers";

// PATCH /api/users/[id]  (Admin only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const { name, role, isActive } = body;

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
