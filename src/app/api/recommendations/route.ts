import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { getAbsenceRecommendation } from "@/lib/recommendations";

// GET /api/recommendations?scheduleId=xxx
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const scheduleId = new URL(req.url).searchParams.get("scheduleId");
  if (!scheduleId) {
    return NextResponse.json(
      { error: "scheduleId query param is required" },
      { status: 400 }
    );
  }

  try {
    const recommendation = await getAbsenceRecommendation(
      session!.user.id,
      scheduleId
    );
    return NextResponse.json(recommendation);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("No")) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }
    throw e;
  }
}
