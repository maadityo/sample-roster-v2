import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth } from "date-fns";
import { MAX_ABSENCES_PER_MONTH } from "@/lib/constants";
import { AdminKakakList } from "@/components/admin/admin-kakak-list";

export default async function AdminKakaksPage() {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const kakaks = await prisma.user.findMany({
    where: { role: "KAKAK" },
    orderBy: { name: "asc" },
    include: {
      absences: {
        where: {
          status: { in: ["APPROVED", "PENDING"] },
          schedule: { date: { gte: monthStart, lte: monthEnd } },
        },
        include: { schedule: { select: { date: true } } },
      },
    },
  });

  const data = kakaks.map((k) => ({
    id: k.id,
    name: k.name,
    email: k.email,
    image: k.image,
    isActive: k.isActive,
    monthlyAbsenceCount: k.absences.length,
    atLimit: k.absences.length >= MAX_ABSENCES_PER_MONTH,
    approachingLimit: k.absences.length === MAX_ABSENCES_PER_MONTH - 1,
    absences: k.absences.map((a) => ({
      id: a.id,
      status: a.status,
      date: a.schedule.date.toISOString(),
    })),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Kakaks</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {data.length} registered volunteers
        </p>
      </div>
      <AdminKakakList kakaks={data} maxPerMonth={MAX_ABSENCES_PER_MONTH} />
    </div>
  );
}
