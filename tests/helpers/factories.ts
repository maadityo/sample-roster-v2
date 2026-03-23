/**
 * Test helpers — factory functions for creating test data
 * and a fetch wrapper that mocks auth for API route tests.
 */
import { prisma } from "../setup";
import type { User, Church, Service, Schedule } from "@prisma/client";

// ─── Factories ───────────────────────────────────────────────────────────────

export async function createUser(
  overrides: Partial<{ email: string; name: string; role: "KAKAK" | "ADMIN" }> = {}
): Promise<User> {
  return prisma.user.create({
    data: {
      email: overrides.email ?? `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      name: overrides.name ?? "Test User",
      role: overrides.role ?? "KAKAK",
    },
  });
}

export async function createChurch(name?: string): Promise<Church> {
  return prisma.church.create({
    data: { name: name ?? `Church-${Date.now()}`, sortOrder: 0 },
  });
}

export async function createService(
  churchId: string,
  overrides: Partial<{ time: string; name: string }> = {}
): Promise<Service> {
  return prisma.service.create({
    data: {
      churchId,
      time: overrides.time ?? "10:00",
      name: overrides.name ?? `Service-${Date.now()}`,
      sortOrder: 0,
    },
  });
}

export async function createSchedule(date?: Date): Promise<Schedule> {
  // Default: 1st Sunday of NEXT month.
  // Using next month guarantees (a) the date is in the future, and
  // (b) adding up to +14 days stays within that same month, so
  // tests that need multiple Sundays (e.g. monthly quota tests) are safe.
  const d = date ?? (() => {
    const now = new Date();
    const firstOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    while (firstOfNextMonth.getDay() !== 0) {
      firstOfNextMonth.setDate(firstOfNextMonth.getDate() + 1);
    }
    firstOfNextMonth.setHours(0, 0, 0, 0);
    return firstOfNextMonth;
  })();

  return prisma.schedule.create({
    data: { date: d, title: "Test Service" },
  });
}

/** Create a full absence in the DB (bypasses API auth) */
export async function createAbsence(
  userId: string,
  scheduleId: string,
  serviceId: string,
  opts: { status?: "PENDING" | "APPROVED" | "CANCELLED" | "REJECTED"; reason?: string } = {}
) {
  return prisma.absence.create({
    data: {
      userId,
      scheduleId,
      serviceId,
      status: opts.status ?? "PENDING",
      reason: opts.reason ?? null,
    },
  });
}

// ─── API caller ───────────────────────────────────────────────────────────────

const BASE_URL = process.env.TEST_APP_URL ?? "http://localhost:3000";

/**
 * Make an authenticated API request.
 * Passes a special header that the test auth middleware trusts.
 */
export async function apiAs(
  user: User,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      // Test-mode auth header — trusted by modified requireAuth in test mode
      "x-test-user-id": user.id,
      "x-test-user-role": user.role,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
}
