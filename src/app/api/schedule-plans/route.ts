import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).scheduleId !== "string" ||
    !Array.isArray((body as Record<string, unknown>).serviceIds)
  ) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { scheduleId, serviceIds } = body as { scheduleId: string; serviceIds: string[] };

  // Validate all serviceIds are strings
  if (!serviceIds.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: "Invalid serviceIds" }, { status: 400 });
  }

  // Verify the schedule exists
  const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId }, select: { id: true } });
  if (!schedule) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  const plan = await prisma.schedulePlan.upsert({
    where: { userId_scheduleId: { userId, scheduleId } },
    create: { userId, scheduleId, serviceIds },
    update: { serviceIds },
    select: { id: true, scheduleId: true, serviceIds: true },
  });

  return NextResponse.json(plan, { status: 200 });
}
