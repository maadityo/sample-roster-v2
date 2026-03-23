"use client";

import { formatShortDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { AbsenceStatus } from "@prisma/client";

interface AbsenceHistoryProps {
  absences: {
    id: string;
    status: AbsenceStatus;
    reason: string | null;
    adminNote: string | null;
    createdAt: Date;
    schedule: {
      date: Date;
      title: string | null;
    };
    service: {
      time: string;
      name: string;
      church: { name: string };
    };
  }[];
}

const statusConfig: Record<
  AbsenceStatus,
  { label: string; variant: "success" | "warning" | "destructive" | "secondary" }
> = {
  APPROVED: { label: "Approved", variant: "success" },
  PENDING: { label: "Pending", variant: "warning" },
  REJECTED: { label: "Rejected", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "secondary" },
};

export function AbsenceHistory({ absences }: AbsenceHistoryProps) {
  if (absences.length === 0) {
    return (
      <div className="text-center text-gray-400 py-12">
        <p className="text-4xl mb-2">📅</p>
        <p>No absences yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {absences.map((a) => (
        <div
          key={a.id}
          className="bg-white rounded-xl border border-gray-200 p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-gray-900 text-sm">
                {formatShortDate(new Date(a.schedule.date))}
              </p>
              {a.schedule.title && (
                <p className="text-xs text-gray-500">{a.schedule.title}</p>
              )}
              <p className="text-xs text-blue-600 font-medium">
                {a.service.church.name} · {a.service.time} {a.service.name}
              </p>
              {a.reason && (
                <p className="text-xs text-gray-500 mt-1">
                  Reason: {a.reason}
                </p>
              )}
              {a.adminNote && (
                <p className="text-xs text-blue-600 mt-1">
                  Admin note: {a.adminNote}
                </p>
              )}
            </div>
            <Badge variant={statusConfig[a.status].variant}>
              {statusConfig[a.status].label}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
