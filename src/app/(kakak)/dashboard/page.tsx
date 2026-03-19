import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, addDays, nextSunday, startOfDay } from "date-fns";
import { MAX_ABSENCES_PER_MONTH } from "@/lib/constants";
import { ScheduleCard } from "@/components/kakak/schedule-card";
import { AbsenceQuotaBadge } from "@/components/kakak/absence-quota-badge";

export default async function KakakDashboard() {
  const session = await auth();
  const userId = session!.user.id;

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  // Fetch upcoming Sundays (next 8)
  const upcomingSchedules = await prisma.schedule.findMany({
    where: { date: { gte: startOfDay(now), lte: addDays(now, 60) } },
    orderBy: { date: "asc" },
    take: 8,
    include: {
      _count: {
        select: {
          absences: { where: { status: { in: ["APPROVED", "PENDING"] } } },
        },
      },
      absences: {
        where: { userId },
        select: { id: true, status: true },
      },
    },
  });

  // This month's absence count
  const monthlyAbsenceCount = await prisma.absence.count({
    where: {
      userId,
      status: { in: ["APPROVED", "PENDING"] },
      schedule: { date: { gte: monthStart, lte: monthEnd } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          Hi, {session!.user.name?.split(" ")[0]} 👋
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">Upcoming Sunday schedules</p>
      </div>

      <AbsenceQuotaBadge
        used={monthlyAbsenceCount}
        max={MAX_ABSENCES_PER_MONTH}
      />

      <div className="space-y-3">
        {upcomingSchedules.length === 0 ? (
          <p className="text-center text-gray-400 py-8">No upcoming schedules</p>
        ) : (
          upcomingSchedules.map((s) => (
            <ScheduleCard
              key={s.id}
              schedule={{
                id: s.id,
                date: s.date.toISOString(),
                title: s.title,
                isHoliday: s.isHoliday,
                absenceCount: s._count.absences,
                myAbsence: s.absences[0]?.status ?? null,
                myAbsenceId: s.absences[0]?.id ?? null,
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
