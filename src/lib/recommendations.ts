import { prisma } from "@/lib/prisma";
import {
  startOfMonth,
  endOfMonth,
  format,
  getMonth,
  getYear,
} from "date-fns";
import {
  MAX_ABSENCES_PER_MONTH,
  MAX_ABSENCES_PER_SUNDAY,
} from "@/lib/constants";

export interface AbsenceRecommendation {
  targetScheduleId: string;
  targetDate: Date;
  currentMonthAbsenceCount: number;
  remainingMonthlyQuota: number;
  absencesOnTargetSunday: number;
  willExceedPersonalLimit: boolean;
  willExceedTeamLimit: boolean;
  alternativeSundays: AlternativeSunday[];
  warnings: string[];
}

export interface AlternativeSunday {
  scheduleId: string;
  date: Date;
  absenceCount: number;
  isSafeForTeam: boolean;
}

/**
 * Generates smart absence recommendations for a kakak submitting an absence.
 * Checks personal monthly quota and team coverage limits.
 */
export async function getAbsenceRecommendation(
  userId: string,
  scheduleId: string
): Promise<AbsenceRecommendation> {
  const schedule = await prisma.schedule.findUniqueOrThrow({
    where: { id: scheduleId },
  });

  const monthStart = startOfMonth(schedule.date);
  const monthEnd = endOfMonth(schedule.date);

  // Count this kakak's approved/pending absences in the same month
  const personalAbsences = await prisma.absence.count({
    where: {
      userId,
      status: { in: ["APPROVED", "PENDING"] },
      schedule: { date: { gte: monthStart, lte: monthEnd } },
      scheduleId: { not: scheduleId }, // exclude the target Sunday itself
    },
  });

  // Count team absences on the target Sunday
  const teamAbsencesOnTarget = await prisma.absence.count({
    where: {
      scheduleId,
      status: { in: ["APPROVED", "PENDING"] },
    },
  });

  // Get all upcoming Sundays in the same month (excluding target) for alternatives
  const allSchedulesInMonth = await prisma.schedule.findMany({
    where: {
      date: { gte: monthStart, lte: monthEnd },
      id: { not: scheduleId },
    },
    orderBy: { date: "asc" },
    include: {
      _count: {
        select: {
          absences: {
            where: { status: { in: ["APPROVED", "PENDING"] } },
          },
        },
      },
    },
  });

  const alternativeSundays: AlternativeSunday[] = allSchedulesInMonth.map(
    (s) => ({
      scheduleId: s.id,
      date: s.date,
      absenceCount: s._count.absences,
      isSafeForTeam: s._count.absences < MAX_ABSENCES_PER_SUNDAY,
    })
  );

  const willExceedPersonalLimit =
    personalAbsences + 1 > MAX_ABSENCES_PER_MONTH;
  const willExceedTeamLimit =
    teamAbsencesOnTarget + 1 > MAX_ABSENCES_PER_SUNDAY;

  const warnings: string[] = [];
  if (willExceedPersonalLimit) {
    warnings.push(
      `You will exceed your personal absence limit of ${MAX_ABSENCES_PER_MONTH} per month.`
    );
  }
  if (willExceedTeamLimit) {
    warnings.push(
      `Too many kakaks are already absent on ${format(schedule.date, "d MMMM yyyy")} (${teamAbsencesOnTarget}/${MAX_ABSENCES_PER_SUNDAY}).`
    );
  }

  return {
    targetScheduleId: scheduleId,
    targetDate: schedule.date,
    currentMonthAbsenceCount: personalAbsences,
    remainingMonthlyQuota: Math.max(
      0,
      MAX_ABSENCES_PER_MONTH - personalAbsences
    ),
    absencesOnTargetSunday: teamAbsencesOnTarget,
    willExceedPersonalLimit,
    willExceedTeamLimit,
    alternativeSundays,
    warnings,
  };
}
