/**
 * API Integration Tests — /api/absences
 *
 * Tests route handler logic directly (no HTTP server needed).
 * Auth is mocked via vi.mock so the business logic runs against the real test DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../setup";
import {
  createUser,
  createChurch,
  createService,
  createSchedule,
  createAbsence,
} from "../helpers/factories";
import type { User, Church, Service, Schedule } from "@prisma/client";

// ── Mock auth so tests control the session ──────────────────────────────────
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));
import { auth } from "@/lib/auth";
const mockAuth = vi.mocked(auth);

// Import route handlers AFTER mocking
import { POST, GET } from "@/app/api/absences/route";
import { PATCH } from "@/app/api/absences/[id]/route";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeSession(user: User) {
  return {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    expires: new Date(Date.now() + 86400_000).toISOString(),
  };
}

function req(method: string, path: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

// ── Shared test data ─────────────────────────────────────────────────────────

let kakak: User;
let church: Church;
let service: Service;
let schedule: Schedule;

beforeEach(async () => {
  kakak = await createUser({ role: "KAKAK" });
  church = await createChurch("Sydney City");
  service = await createService(church.id, { time: "10:00", name: "All Stars" });
  schedule = await createSchedule();
  mockAuth.mockResolvedValue(makeSession(kakak) as any);
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/absences", () => {
  it("creates a new PENDING absence", async () => {
    const res = await POST(req("POST", "/api/absences", {
      scheduleId: schedule.id,
      serviceId: service.id,
      reason: "Family event",
    }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("PENDING");
    expect(body.userId).toBe(kakak.id);

    const inDb = await prisma.absence.findFirst({ where: { userId: kakak.id } });
    expect(inDb).not.toBeNull();
    expect(inDb!.status).toBe("PENDING");
  });

  it("returns 409 if a PENDING absence already exists for same service+sunday", async () => {
    await createAbsence(kakak.id, schedule.id, service.id, { status: "PENDING" });

    const res = await POST(req("POST", "/api/absences", {
      scheduleId: schedule.id,
      serviceId: service.id,
    }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already have an absence/i);
  });

  it("returns 409 if an APPROVED absence already exists", async () => {
    await createAbsence(kakak.id, schedule.id, service.id, { status: "APPROVED" });

    const res = await POST(req("POST", "/api/absences", {
      scheduleId: schedule.id,
      serviceId: service.id,
    }));

    expect(res.status).toBe(409);
  });

  it("reactivates a CANCELLED absence instead of creating duplicate", async () => {
    const existing = await createAbsence(kakak.id, schedule.id, service.id, {
      status: "CANCELLED",
    });

    const res = await POST(req("POST", "/api/absences", {
      scheduleId: schedule.id,
      serviceId: service.id,
      reason: "Re-submitting",
    }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("PENDING");
    // Same record ID — reactivated, not a new row
    expect(body.id).toBe(existing.id);

    const count = await prisma.absence.count({ where: { userId: kakak.id } });
    expect(count).toBe(1); // still only 1 row
  });

  it("reactivates a REJECTED absence instead of creating duplicate", async () => {
    const existing = await createAbsence(kakak.id, schedule.id, service.id, {
      status: "REJECTED",
    });

    const res = await POST(req("POST", "/api/absences", {
      scheduleId: schedule.id,
      serviceId: service.id,
    }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe(existing.id);
    expect(body.status).toBe("PENDING");
  });

  it("returns 422 when monthly absence limit is reached", async () => {
    // Fill up previous Sundays for the same month
    const sunday1 = await createSchedule(nthSundayThisMonth(1));
    const sunday2 = await createSchedule(nthSundayThisMonth(2));
    const svc2 = await createService(church.id, { name: "Service2" });

    await createAbsence(kakak.id, sunday1.id, service.id, { status: "PENDING" });
    await createAbsence(kakak.id, sunday2.id, svc2.id, { status: "PENDING" });

    // Now try a 3rd Sunday in same month (limit = 2)
    const sunday3 = await createSchedule(nthSundayThisMonth(3));
    const res = await POST(req("POST", "/api/absences", {
      scheduleId: sunday3.id,
      serviceId: service.id,
    }));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("PERSONAL_LIMIT_EXCEEDED");
  });

  it("returns 422 when team absence limit is reached for a service", async () => {
    // 3 other kakaks already absent for this service on this sunday
    for (let i = 0; i < 3; i++) {
      const other = await createUser({ role: "KAKAK" });
      await createAbsence(other.id, schedule.id, service.id, { status: "PENDING" });
    }

    const res = await POST(req("POST", "/api/absences", {
      scheduleId: schedule.id,
      serviceId: service.id,
    }));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("TEAM_LIMIT_EXCEEDED");
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null as any);

    const res = await POST(req("POST", "/api/absences", {
      scheduleId: schedule.id,
      serviceId: service.id,
    }));

    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid request body", async () => {
    const res = await POST(req("POST", "/api/absences", {
      // missing required fields
      reason: "oops",
    }));

    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent schedule", async () => {
    const res = await POST(req("POST", "/api/absences", {
      scheduleId: "non-existent-schedule-id",
      serviceId: service.id,
    }));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/schedule not found/i);
  });

  it("returns 404 for non-existent service", async () => {
    const res = await POST(req("POST", "/api/absences", {
      scheduleId: schedule.id,
      serviceId: "non-existent-service-id",
    }));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/service not found/i);
  });
});

describe("PATCH /api/absences/[id]", () => {
  it("kakak can cancel their own PENDING absence", async () => {
    const absence = await createAbsence(kakak.id, schedule.id, service.id, {
      status: "PENDING",
    });

    const res = await PATCH(
      req("PATCH", `/api/absences/${absence.id}`, { status: "CANCELLED" }),
      { params: Promise.resolve({ id: absence.id }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("CANCELLED");

    const inDb = await prisma.absence.findUnique({ where: { id: absence.id } });
    expect(inDb!.status).toBe("CANCELLED");
  });

  it("kakak cannot cancel another kakak's absence", async () => {
    const other = await createUser({ role: "KAKAK" });
    const absence = await createAbsence(other.id, schedule.id, service.id, {
      status: "PENDING",
    });

    const res = await PATCH(
      req("PATCH", `/api/absences/${absence.id}`, { status: "CANCELLED" }),
      { params: Promise.resolve({ id: absence.id }) }
    );

    expect(res.status).toBe(403);
  });

  it("admin can approve a PENDING absence", async () => {
    const admin = await createUser({ role: "ADMIN" });
    mockAuth.mockResolvedValueOnce(makeSession(admin) as any);

    const absence = await createAbsence(kakak.id, schedule.id, service.id, {
      status: "PENDING",
    });

    const res = await PATCH(
      req("PATCH", `/api/absences/${absence.id}`, {
        status: "APPROVED",
        adminNote: "Approved by admin",
      }),
      { params: Promise.resolve({ id: absence.id }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("APPROVED");
    expect(body.adminNote).toBe("Approved by admin");
  });

  it("returns 404 for non-existent absence", async () => {
    const res = await PATCH(
      req("PATCH", "/api/absences/does-not-exist", { status: "CANCELLED" }),
      { params: Promise.resolve({ id: "does-not-exist" }) }
    );

    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null as any);
    const absence = await createAbsence(kakak.id, schedule.id, service.id);

    const res = await PATCH(
      req("PATCH", `/api/absences/${absence.id}`, { status: "CANCELLED" }),
      { params: Promise.resolve({ id: absence.id }) }
    );

    expect(res.status).toBe(401);
  });
});

describe("GET /api/absences", () => {
  it("returns kakak's own absences", async () => {
    await createAbsence(kakak.id, schedule.id, service.id, { status: "PENDING" });

    const other = await createUser({ role: "KAKAK" });
    const otherSvc = await createService(church.id, { name: "OtherSvc" });
    await createAbsence(other.id, schedule.id, otherSvc.id, { status: "PENDING" });

    const res = await GET(req("GET", "/api/absences"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].userId).toBe(kakak.id);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null as any);
    const res = await GET(req("GET", "/api/absences"));
    expect(res.status).toBe(401);
  });
});

// ── Utility ──────────────────────────────────────────────────────────────────

/** Get the Nth Sunday of the current month (1-indexed) */
function nthSundayThisMonth(n: number): Date {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  // advance to first Sunday
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
  d.setDate(d.getDate() + (n - 1) * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}
