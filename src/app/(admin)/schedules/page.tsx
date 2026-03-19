import { prisma } from "@/lib/prisma";
import { startOfDay, addDays } from "date-fns";
import { AdminScheduleList } from "@/components/admin/admin-schedule-list";

export default async function AdminSchedulesPage() {
  const schedules = await prisma.schedule.findMany({
    where: { date: { gte: startOfDay(new Date()), lte: addDays(new Date(), 120) } },
    orderBy: { date: "asc" },
    include: {
      _count: {
        select: {
          absences: { where: { status: { in: ["APPROVED", "PENDING"] } } },
        },
      },
      absences: {
        where: { status: { in: ["APPROVED", "PENDING"] } },
        include: { user: { select: { name: true, email: true, image: true } } },
      },
    },
  });

  const data = schedules.map((s) => ({
    id: s.id,
    date: s.date.toISOString(),
    title: s.title,
    notes: s.notes,
    isHoliday: s.isHoliday,
    absenceCount: s._count.absences,
    absentKakaks: s.absences.map((a) => ({
      absenceId: a.id,
      status: a.status,
      reason: a.reason,
      adminNote: a.adminNote,
      user: a.user,
    })),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Schedules</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage upcoming Sunday services</p>
        </div>
      </div>
      <AdminScheduleList schedules={data} />
    </div>
  );
}
