import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, addMonths, parseISO, isValid } from "date-fns";
import {
  AdminRosterTable,
  type RosterSchedule,
} from "@/components/admin/admin-roster-table";

interface Props {
  searchParams: Promise<{ month?: string }>;
}

export default async function AdminRosterPage({ searchParams }: Props) {
  const params = await searchParams;
  const now = new Date();

  // Parse ?month=2026-04  or default to next month
  let targetMonth = addMonths(now, 1);
  if (params.month) {
    const parsed = parseISO(`${params.month}-01`);
    if (isValid(parsed)) targetMonth = parsed;
  }

  const monthStart = startOfMonth(targetMonth);
  const monthEnd = endOfMonth(targetMonth);

  const [schedules, allKakaks, churches, absences, schedulePlans] =
    await Promise.all([
      prisma.schedule.findMany({
        where: { date: { gte: monthStart, lte: monthEnd } },
        orderBy: { date: "asc" },
      }).then((rows) => rows.filter((s) => s.date.getDay() === 0)), // Sundays only
      prisma.user.findMany({
        where: { isActive: true, role: "KAKAK" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true },
      }),
      prisma.church.findMany({
        orderBy: { sortOrder: "asc" },
        include: { services: { orderBy: { sortOrder: "asc" } } },
      }),
      // One record per user per schedule (APPROVED only)
      prisma.absence.findMany({
        where: {
          status: "APPROVED",
          schedule: { date: { gte: monthStart, lte: monthEnd } },
        },
        distinct: ["userId", "scheduleId"],
        select: { userId: true, scheduleId: true, reason: true },
      }),
      prisma.schedulePlan.findMany({
        where: {
          schedule: { date: { gte: monthStart, lte: monthEnd } },
        },
        select: { userId: true, scheduleId: true, serviceIds: true },
      }),
    ]);

  const allServices = churches.flatMap((c) =>
    c.services.map((svc) => ({
      id: svc.id,
      time: svc.time,
      name: svc.name,
      churchName: c.name,
    }))
  );

  const rosterData: RosterSchedule[] = schedules.map((schedule) => {
    const absencesForDay = absences.filter((a) => a.scheduleId === schedule.id);
    const absentUserIds = new Set(absencesForDay.map((a) => a.userId));
    const absentReasonByUser = new Map(
      absencesForDay.map((a) => [a.userId, a.reason])
    );

    const plansForDay = schedulePlans.filter((p) => p.scheduleId === schedule.id);
    const planByUser = new Map(plansForDay.map((p) => [p.userId, p.serviceIds]));
    const hasPlanUserIds = new Set(plansForDay.map((p) => p.userId));
    // A kakak has "submitted" if they either filed an absence OR saved a service plan
    const submittedUserIds = new Set([...absentUserIds, ...hasPlanUserIds]);

    const ijinKakaks = allKakaks
      .filter((k) => absentUserIds.has(k.id))
      .map((k) => ({ ...k, reason: absentReasonByUser.get(k.id) ?? null }));

    const belumSubmitKakaks = allKakaks.filter(
      (k) => !submittedUserIds.has(k.id)
    );

    const serviceRows = allServices.map((svc) => ({
      serviceId: svc.id,
      serviceTime: svc.time,
      serviceName: svc.name,
      churchName: svc.churchName,
      hadir: allKakaks.filter(
        (k) =>
          !absentUserIds.has(k.id) &&
          (planByUser.get(k.id)?.includes(svc.id) ?? false)
      ),
    }));

    return {
      scheduleId: schedule.id,
      date: schedule.date.toISOString(),
      title: schedule.title,
      isHoliday: schedule.isHoliday,
      ijin: ijinKakaks,
      belumSubmit: belumSubmitKakaks,
      services: serviceRows,
    };
  });

  const monthName = new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(targetMonth);

  const monthKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Roster</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {allKakaks.length} kakak aktif · {schedules.length} jadwal pelayanan
          </p>
        </div>
        {/* Month navigator */}
        <div className="flex items-center gap-2">
          <a
            href={`/admin/roster?month=${monthKey(addMonths(targetMonth, -1))}`}
            className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
          >
            ‹
          </a>
          <span className="text-sm font-medium text-gray-800 min-w-[150px] text-center capitalize">
            {monthName}
          </span>
          <a
            href={`/admin/roster?month=${monthKey(addMonths(targetMonth, 1))}`}
            className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
          >
            ›
          </a>
        </div>
      </div>

      <AdminRosterTable schedules={rosterData} totalKakaks={allKakaks.length} />
    </div>
  );
}
