import { prisma } from "@/lib/prisma";
import { startOfDay, addDays, startOfMonth, endOfMonth } from "date-fns";
import { MAX_ABSENCES_PER_MONTH, MAX_ABSENCES_PER_SUNDAY } from "@/lib/constants";
import { AdminDashboardStats } from "@/components/admin/admin-dashboard-stats";

export default async function AdminDashboard() {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  // Upcoming 8 Sundays
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
    },
  });

  // Kakaks approaching or at monthly limit
  const allKakaks = await prisma.user.findMany({
    where: { isActive: true, role: "KAKAK" },
    include: {
      absences: {
        where: {
          status: { in: ["APPROVED", "PENDING"] },
          schedule: { date: { gte: monthStart, lte: monthEnd } },
        },
        select: { id: true },
      },
    },
  });

  const kakaksAtRisk = allKakaks
    .filter((k) => k.absences.length >= MAX_ABSENCES_PER_MONTH - 1)
    .map((k) => ({
      id: k.id,
      name: k.name,
      email: k.email,
      image: k.image,
      monthlyCount: k.absences.length,
      atLimit: k.absences.length >= MAX_ABSENCES_PER_MONTH,
    }));

  const schedulesForDisplay = upcomingSchedules.map((s) => ({
    id: s.id,
    date: s.date.toISOString(),
    title: s.title,
    isHoliday: s.isHoliday,
    absenceCount: s._count.absences,
    isAtRisk: s._count.absences >= MAX_ABSENCES_PER_SUNDAY,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {allKakaks.length} active kakaks · {upcomingSchedules.length} upcoming Sundays
        </p>
      </div>

      <AdminDashboardStats
        schedules={schedulesForDisplay}
        kakaksAtRisk={kakaksAtRisk}
        maxAbsencesPerSunday={MAX_ABSENCES_PER_SUNDAY}
        maxAbsencesPerMonth={MAX_ABSENCES_PER_MONTH}
      />
    </div>
  );
}
