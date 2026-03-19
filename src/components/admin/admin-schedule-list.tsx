"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import { formatShortDate, cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Plus, AlertTriangle, Users } from "lucide-react";
import { AbsenceStatus } from "@prisma/client";

interface AbsentKakak {
  absenceId: string;
  status: AbsenceStatus;
  reason: string | null;
  user: { name: string | null; email: string; image: string | null };
}

interface Schedule {
  id: string;
  date: string;
  title: string | null;
  notes: string | null;
  isHoliday: boolean;
  absenceCount: number;
  absentKakaks: AbsentKakak[];
}

interface AdminScheduleListProps {
  schedules: Schedule[];
}

const statusVariant = {
  APPROVED: "success" as const,
  PENDING: "warning" as const,
  REJECTED: "destructive" as const,
  CANCELLED: "secondary" as const,
};

export function AdminScheduleList({ schedules }: AdminScheduleListProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  async function handleApprove(absenceId: string, status: "APPROVED" | "REJECTED") {
    const res = await fetch(`/api/absences/${absenceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      toast({ title: `Absence ${status.toLowerCase()}` });
      router.refresh();
    } else {
      toast({ title: "Failed", variant: "destructive" });
    }
  }

  async function handleAddSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!newDate) return;
    setSaving(true);
    const res = await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: newDate, title: newTitle || undefined }),
    });
    setSaving(false);
    if (res.ok) {
      toast({ title: "Schedule created" });
      setShowAddForm(false);
      setNewDate("");
      setNewTitle("");
      router.refresh();
    } else {
      toast({ title: "Failed to create schedule", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      {/* Add schedule button */}
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => setShowAddForm((v) => !v)}
          className="gap-1.5"
        >
          <Plus className="w-4 h-4" />
          Add Sunday
        </Button>
      </div>

      {/* Add schedule form */}
      {showAddForm && (
        <Card className="border-dashed border-blue-300">
          <CardContent className="p-4">
            <form onSubmit={handleAddSchedule} className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Date (Sunday)
                </label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Title (optional)
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Palm Sunday, Regular Service"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddForm(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? "Saving..." : "Create"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Schedule list */}
      {schedules.map((s) => (
        <Card key={s.id} className={cn(s.isHoliday && "border-amber-200")}>
          <CardContent className="p-4">
            <button
              className="w-full text-left"
              onClick={() =>
                setExpanded((prev) => (prev === s.id ? null : s.id))
              }
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 text-sm">
                      {formatShortDate(new Date(s.date))}
                    </span>
                    {s.isHoliday && (
                      <Badge variant="warning">Holiday</Badge>
                    )}
                    {s.title && (
                      <span className="text-gray-500 text-xs">{s.title}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-gray-400" />
                    <span
                      className={cn(
                        "text-sm font-medium",
                        s.absenceCount >= 3
                          ? "text-red-600"
                          : s.absenceCount >= 2
                          ? "text-yellow-600"
                          : "text-gray-700"
                      )}
                    >
                      {s.absenceCount} absent
                    </span>
                    {s.absenceCount >= 3 && (
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                    )}
                  </div>
                  {expanded === s.id ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              </div>
            </button>

            {/* Expanded absence list */}
            {expanded === s.id && (
              <div className="mt-4 space-y-2 border-t pt-4">
                {s.absentKakaks.length === 0 ? (
                  <p className="text-sm text-gray-400">No absences submitted</p>
                ) : (
                  s.absentKakaks.map((a) => (
                    <div
                      key={a.absenceId}
                      className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {a.user.name ?? a.user.email}
                        </p>
                        {a.reason && (
                          <p className="text-xs text-gray-500">{a.reason}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={statusVariant[a.status]}>
                          {a.status}
                        </Badge>
                        {a.status === "PENDING" && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleApprove(a.absenceId, "APPROVED")}
                              className="text-xs text-green-700 bg-green-100 hover:bg-green-200 rounded px-2 py-0.5 font-medium"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleApprove(a.absenceId, "REJECTED")}
                              className="text-xs text-red-700 bg-red-100 hover:bg-red-200 rounded px-2 py-0.5 font-medium"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {schedules.length === 0 && (
        <div className="text-center text-gray-400 py-12">
          <p className="text-4xl mb-2">📅</p>
          <p>No upcoming schedules. Add one above.</p>
        </div>
      )}
    </div>
  );
}
