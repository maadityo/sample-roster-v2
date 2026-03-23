/**
 * Unit Tests — Absence recommendation logic (src/lib/recommendations.ts)
 *
 * Tests the business logic functions directly against the test DB.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getAbsenceRecommendation } from "@/lib/recommendations";
import {
  createUser,
  createChurch,
  createService,
  createSchedule,
  createAbsence,
} from "../helpers/factories";
import type { User, Church, Service, Schedule } from "@prisma/client";

let kakak: User;
let church: Church;
let service: Service;
let schedule: Schedule;

beforeEach(async () => {
  kakak = await createUser({ role: "KAKAK" });
  church = await createChurch("Test Church");
  service = await createService(church.id);
  schedule = await createSchedule();
});

describe("getAbsenceRecommendation", () => {
  it("returns full quota remaining when no absences this month", async () => {
    const rec = await getAbsenceRecommendation(kakak.id, schedule.id);

    expect(rec.currentMonthAbsenceCount).toBe(0);
    expect(rec.remainingMonthlyQuota).toBe(2);
    expect(rec.willExceedPersonalLimit).toBe(false);
    expect(rec.willExceedTeamLimit).toBe(false);
    expect(rec.warnings).toHaveLength(0);
  });

  it("flags willExceedPersonalLimit when already at limit", async () => {
    // user already has 2 absences this month on other sundays
    const s1 = await createSchedule(offsetSunday(1));
    const s2 = await createSchedule(offsetSunday(2));
    await createAbsence(kakak.id, s1.id, service.id, { status: "PENDING" });
    await createAbsence(kakak.id, s2.id, service.id, { status: "PENDING" });

    const rec = await getAbsenceRecommendation(kakak.id, schedule.id);

    expect(rec.currentMonthAbsenceCount).toBe(2);
    expect(rec.remainingMonthlyQuota).toBe(0);
    expect(rec.willExceedPersonalLimit).toBe(true);
    expect(rec.warnings.some((w) => w.includes("personal absence limit"))).toBe(true);
  });

  it("does not count CANCELLED absences toward personal limit", async () => {
    const s1 = await createSchedule(offsetSunday(1));
    await createAbsence(kakak.id, s1.id, service.id, { status: "CANCELLED" });

    const rec = await getAbsenceRecommendation(kakak.id, schedule.id);

    expect(rec.currentMonthAbsenceCount).toBe(0);
    expect(rec.willExceedPersonalLimit).toBe(false);
  });

  it("does not count REJECTED absences toward personal limit", async () => {
    const s1 = await createSchedule(offsetSunday(1));
    await createAbsence(kakak.id, s1.id, service.id, { status: "REJECTED" });

    const rec = await getAbsenceRecommendation(kakak.id, schedule.id);

    expect(rec.currentMonthAbsenceCount).toBe(0);
  });

  it("flags willExceedTeamLimit when team is at limit", async () => {
    // 3 other kakaks absent on same sunday
    for (let i = 0; i < 3; i++) {
      const other = await createUser({ role: "KAKAK" });
      await createAbsence(other.id, schedule.id, service.id, { status: "PENDING" });
    }

    const rec = await getAbsenceRecommendation(kakak.id, schedule.id);

    expect(rec.absencesOnTargetSunday).toBe(3);
    expect(rec.willExceedTeamLimit).toBe(true);
    expect(rec.warnings.some((w) => w.includes("Too many kakaks"))).toBe(true);
  });

  it("returns alternative sundays in the same month", async () => {
    const alt1 = await createSchedule(offsetSunday(1));
    const alt2 = await createSchedule(offsetSunday(2));

    const rec = await getAbsenceRecommendation(kakak.id, schedule.id);

    const altIds = rec.alternativeSundays.map((a) => a.scheduleId);
    expect(altIds).toContain(alt1.id);
    expect(altIds).toContain(alt2.id);
    expect(altIds).not.toContain(schedule.id); // target not included
  });

  it("marks alternatives as isSafeForTeam based on absence count", async () => {
    const alt = await createSchedule(offsetSunday(1));
    // Fill alt with 3 absences (at team limit)
    for (let i = 0; i < 3; i++) {
      const other = await createUser({ role: "KAKAK" });
      await createAbsence(other.id, alt.id, service.id, { status: "PENDING" });
    }

    const rec = await getAbsenceRecommendation(kakak.id, schedule.id);

    const altEntry = rec.alternativeSundays.find((a) => a.scheduleId === alt.id);
    expect(altEntry).toBeDefined();
    expect(altEntry!.isSafeForTeam).toBe(false);
    expect(altEntry!.absenceCount).toBe(3);
  });

  it("throws if schedule is not found", async () => {
    await expect(
      getAbsenceRecommendation(kakak.id, "nonexistent-schedule")
    ).rejects.toThrow();
  });
});

// ── Utility ──────────────────────────────────────────────────────────────────

/**
 * Return the Sunday that is N weeks after schedule.date (which is always the
 * 1st Sunday of next month, so adding ≤2 weeks stays in that same month).
 */
function offsetSunday(weeksFromNow: number): Date {
  const d = new Date(schedule.date);
  d.setDate(d.getDate() + weeksFromNow * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}
