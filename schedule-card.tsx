"use client";

import { useState } from "react";
import { format } from "date-fns";
import { AbsenceStatus } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AbsenceSubmitModal } from "@/components/kakak/absence-submit-modal";
import { useToast } from "@/components/ui/toaster";
import { useRouter } from "next/navigation";
import { cn, formatShortDate } from "@/lib/utils";
import { CalendarDays, Users, AlertTriangle } from "lucide-react";

interface ScheduleCardProps {
  schedule: {
    id: string;
    date: string;
    title: string | null;
    isHoliday: boolean;
    absenceCount: number;
    myAbsence: AbsenceStatus | null;
    myAbsenceId: string | null;
  };
}

const statusConfig = {
  APPROVED: { label: "Approved absence", variant: "success" as const },
  PENDING: { label: "Pending", variant: "warning" as const },
  REJECTED: { label: "Rejected", variant: "destructive" as const },
  CANCELLED: { label: "Cancelled", variant: "secondary" as const },
};

export function ScheduleCard({ schedule }: ScheduleCardProps) {
  const [showModal, setShowModal] = useState(false);
  const [myAbsence, setMyAbsence] = useState(schedule.myAbsence);
  const [myAbsenceId, setMyAbsenceId] = useState(schedule.myAbsenceId);
  const [absenceCount, setAbsenceCount] = useState(schedule.absenceCount);
  const [cancelling, setCancelling] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const date = new Date(schedule.date);
  const isUpcoming = date > new Date();

  async function handleCancel() {
    if (!myAbsenceId) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/absences/${myAbsenceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      if (!res.ok) throw new Error("Failed");
      setMyAbsence("CANCELLED");
      setAbsenceCount((c) => Math.max(0, c - 1));
      toast({ title: "Absence cancelled" });
      router.refresh();
    } catch {
      toast({ title: "Failed to cancel", variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  }

  function handleAbsenceSubmitted(status: AbsenceStatus, id: string) {
    setMyAbsence(status);
    setMyAbsenceId(id);
    setAbsenceCount((c) => c + 1);
    setShowModal(false);
    router.refresh();
  }

  return (
    <>
      <Card
        className={cn(
          "transition-all",
          schedule.isHoliday && "border-amber-200 bg-amber-50/50"
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <CalendarDays className="w-4 h-4 text-blue-500 shrink-0" />
                <span className="font-semibold text-gray-900 text-sm">
                  {formatShortDate(date)}
                </span>
                {schedule.isHoliday && (
                  <Badge variant="warning" className="text-xs">Holiday</Badge>
                )}
              </div>

              {schedule.title && (
                <p className="text-xs text-gray-500 ml-6 mb-2">{schedule.title}</p>
              )}

              <div className="flex items-center gap-1 ml-6">
                <Users className="w-3.5 h-3.5 text-gray-400" />
                <span
                  className={cn(
                    "text-xs",
                    absenceCount >= 3
                      ? "text-red-600 font-medium"
                      : absenceCount >= 2
                      ? "text-yellow-600"
                      : "text-gray-500"
                  )}
                >
                  {absenceCount} absent
                </span>
                {absenceCount >= 3 && (
                  <AlertTriangle className="w-3 h-3 text-red-500 ml-0.5" />
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              {myAbsence && myAbsence !== "CANCELLED" ? (
                <>
                  <Badge variant={statusConfig[myAbsence].variant}>
                    {statusConfig[myAbsence].label}
                  </Badge>
                  {myAbsence === "PENDING" && isUpcoming && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 text-red-600 hover:text-red-700"
                      onClick={handleCancel}
                      disabled={cancelling}
                    >
                      {cancelling ? "..." : "Cancel"}
                    </Button>
                  )}
                </>
              ) : isUpcoming ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-8"
                  onClick={() => setShowModal(true)}
                >
                  Submit Absence
                </Button>
              ) : (
                <span className="text-xs text-gray-400">Past</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {showModal && (
        <AbsenceSubmitModal
          schedule={schedule}
          onClose={() => setShowModal(false)}
          onSubmitted={handleAbsenceSubmitted}
        />
      )}
    </>
  );
}
