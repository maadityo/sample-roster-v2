import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

// GET /api/churches — returns all churches with their services, ordered
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const churches = await prisma.church.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      services: { orderBy: { sortOrder: "asc" } },
    },
  });

  return NextResponse.json(churches);
}
