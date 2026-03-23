import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, addMonths } from "date-fns";
import { MAX_ABSENCES_PER_MONTH, MAX_ABSENCES_PER_SUNDAY } from "@/lib/constants";
import { AbsenceSubmitForm } from "@/components/kakak/absence-submit-form";

export default async function KakakDashboard() {
  const session = await auth();
  const userId = session!.user.id;

  const now = new Date();
  // Rosters are prepared ~1 week before month-end, so always show NEXT month.
  const targetMonth = addMonths(now, 1);
  const monthStart = startOfMonth(targetMonth);
  const monthEnd = endOfMonth(targetMonth);

  // Fetch upcoming schedules + all churches/services in parallel
  const [upcomingSchedules, churches, monthlyAbsenceScheduleIds] =
    await Promise.all([
      prisma.schedule.findMany({
        where: { date: { gte: monthStart, lte: monthEnd } },
        orderBy: { date: "asc" },
        include: {
          absences: {
            where: { status: { in: ["APPROVED", "PENDING"] } },
            orderBy: { createdAt: "asc" },
            select: { userId: true, serviceId: true, status: true, id: true, createdAt: true, user: { select: { name: true } } },
          },
        },
      }),
      prisma.church.findMany({
        orderBy: { sortOrder: "asc" },
        include: { services: { orderBy: { sortOrder: "asc" } } },
      }),
      // Count distinct Sundays for monthly limit display
      prisma.absence.groupBy({
        by: ["scheduleId"],
        where: {
          userId,
          status: { in: ["APPROVED", "PENDING"] },
          schedule: { date: { gte: monthStart, lte: monthEnd } },
        },
      }),
    ]);

  const monthlyAbsentIds = monthlyAbsenceScheduleIds.map((g) => g.scheduleId);
  const hasSubmitted = monthlyAbsentIds.length > 0;

  // Fetch saved service plans for this kakak (cross-device persistence)
  const servicePlans = await prisma.schedulePlan.findMany({
    where: { userId, scheduleId: { in: upcomingSchedules.map((s) => s.id) } },
    select: { scheduleId: true, serviceIds: true },
  });
  const servicePlanMap = new Map(servicePlans.map((p) => [p.scheduleId, p.serviceIds]));

  const monthName = new Intl.DateTimeFormat("id-ID", { month: "long" })
    .format(targetMonth)
    .replace(/^\w/, (c) => c.toUpperCase());

  // Build the schedule+church/service tree for the UI
  const scheduleData = upcomingSchedules
    .filter((s) => s.date.getDay() === 0) // Sundays only
    .map((s) => {
    const teamCountByService = new Map<string, number>();
    const myAbsenceByService = new Map<string, { id: string; status: string }>();
    const seenAbsentUsers = new Set<string>();
    const distinctAbsentKakaks: { userId: string; name: string | null }[] = [];
    for (const a of s.absences) {
      teamCountByService.set(a.serviceId, (teamCountByService.get(a.serviceId) ?? 0) + 1);
      if (a.userId === userId) {
        myAbsenceByService.set(a.serviceId, { id: a.id, status: a.status });
      } else if (!seenAbsentUsers.has(a.userId)) {
        seenAbsentUsers.add(a.userId);
        distinctAbsentKakaks.push({ userId: a.userId, name: a.user.name });
      }
    }
    const isFullyBooked = distinctAbsentKakaks.length >= MAX_ABSENCES_PER_SUNDAY;

    return {
      id: s.id,
      date: s.date.toISOString(),
      title: s.title,
      notes: s.notes,
      isHoliday: s.isHoliday,
      absentKakaks: distinctAbsentKakaks,
      isFullyBooked,
      myServicePlan: servicePlanMap.get(s.id) ?? null,
      churches: churches.map((c) => ({
        id: c.id,
        name: c.name,
        services: c.services.map((svc) => ({
          id: svc.id,
          time: svc.time,
          name: svc.name,
          absenceCount: teamCountByService.get(svc.id) ?? 0,
          myAbsence: (myAbsenceByService.get(svc.id)?.status ?? null) as import("@prisma/client").AbsenceStatus | null,
          myAbsenceId: myAbsenceByService.get(svc.id)?.id ?? null,
        })),
      })),
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          Hi, {session!.user.name?.split(" ")[0]} 👋
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">Tick the services you&apos;ll be absent from</p>
      </div>

      <AbsenceSubmitForm
        schedules={scheduleData}
        initialAbsentScheduleIds={monthlyAbsentIds}
        max={MAX_ABSENCES_PER_MONTH}
        maxPerSunday={MAX_ABSENCES_PER_SUNDAY}
        monthName={monthName}
        hasSubmitted={hasSubmitted}
      />
    </div>
  );
}
