import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, addMonths } from "date-fns";
import { MAX_ABSENCES_PER_MONTH } from "@/lib/constants";
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
            select: { userId: true, serviceId: true, status: true, id: true },
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

  const currentMonthKey = `${targetMonth.getFullYear()}-${String(targetMonth.getMonth() + 1).padStart(2, "0")}`;
  const monthName = new Intl.DateTimeFormat("id-ID", { month: "long" })
    .format(targetMonth)
    .replace(/^\w/, (c) => c.toUpperCase());

  // Build the schedule+church/service tree for the UI
  const scheduleData = upcomingSchedules.map((s) => {
    const teamCountByService = new Map<string, number>();
    const myAbsenceByService = new Map<string, { id: string; status: string }>();
    for (const a of s.absences) {
      teamCountByService.set(a.serviceId, (teamCountByService.get(a.serviceId) ?? 0) + 1);
      if (a.userId === userId) {
        myAbsenceByService.set(a.serviceId, { id: a.id, status: a.status });
      }
    }

    return {
      id: s.id,
      date: s.date.toISOString(),
      title: s.title,
      notes: s.notes,
      isHoliday: s.isHoliday,
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
        currentMonthKey={currentMonthKey}
        monthName={monthName}
      />
    </div>
  );
}
