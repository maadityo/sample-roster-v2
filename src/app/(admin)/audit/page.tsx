import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";

const ACTION_LABELS: Record<string, string> = {
  APPROVED_ABSENCE: "Approved absence",
  REJECTED_ABSENCE: "Rejected absence",
  CANCELLED_ABSENCE: "Cancelled absence",
  OVERRIDE_ABSENCE: "Override absence",
};

const ACTION_COLORS: Record<string, string> = {
  APPROVED_ABSENCE: "text-green-700 bg-green-50",
  REJECTED_ABSENCE: "text-red-700 bg-red-50",
  CANCELLED_ABSENCE: "text-gray-700 bg-gray-100",
  OVERRIDE_ABSENCE: "text-amber-700 bg-amber-50",
};

export default async function AuditPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: { select: { name: true, email: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Audit Log</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Admin actions history ({logs.length} entries)
        </p>
      </div>

      {logs.length === 0 ? (
        <div className="text-center text-gray-400 py-16">
          <p className="text-4xl mb-2">📋</p>
          <p>No admin actions recorded yet.</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {logs.map((log) => {
                const details = log.details as Record<string, unknown> | null;
                const adminNote =
                  typeof details?.adminNote === "string"
                    ? details.adminNote
                    : null;

                return (
                  <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            ACTION_COLORS[log.action] ?? "text-gray-700 bg-gray-100"
                          }`}
                        >
                          {ACTION_LABELS[log.action] ?? log.action}
                        </span>
                        <span className="text-xs text-gray-500">
                          by{" "}
                          <span className="font-medium text-gray-700">
                            {log.user.name ?? log.user.email}
                          </span>
                        </span>
                      </div>

                      {adminNote && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Note: {adminNote}
                        </p>
                      )}

                      <p className="text-xs text-gray-400 mt-0.5">
                        ID: <span className="font-mono">{log.entityId}</span>
                      </p>
                    </div>

                    <time className="text-xs text-gray-400 whitespace-nowrap shrink-0">
                      {format(new Date(log.createdAt), "d MMM yyyy, HH:mm")}
                    </time>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
