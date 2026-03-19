import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AbsenceHistory } from "@/components/kakak/absence-history";

export default async function MyAbsencesPage() {
  const session = await auth();
  const userId = session!.user.id;

  const absences = await prisma.absence.findMany({
    where: { userId },
    orderBy: { schedule: { date: "desc" } },
    include: {
      schedule: { select: { date: true, title: true } },
    },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">My Absences</h1>
        <p className="text-gray-500 text-sm mt-0.5">Your absence history</p>
      </div>
      <AbsenceHistory absences={absences} />
    </div>
  );
}
