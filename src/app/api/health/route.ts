import { NextResponse } from "next/server";

/**
 * GET /api/health
 * Simple health check endpoint used by the CI/CD pipeline to verify
 * the app is running after deployment to Azure Container Apps.
 */
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
