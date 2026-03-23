"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import { formatShortDate, cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  AlertTriangle,
  Users,
  Pencil,
  Trash2,
  X,
  Check,
} from "lucide-react";
import { AbsenceStatus } from "@prisma/client";

interface AbsentKakak {
  absenceId: string;
  status: AbsenceStatus;
  reason: string | null;
  adminNote: string | null;
  churchName: string;
  serviceTime: string;
  serviceName: string;
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

  // Add schedule form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit schedule state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editIsHoliday, setEditIsHoliday] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirmation state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Per-absence admin note state (keyed by absenceId)
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { toast } = useToast();
  const router = useRouter();

  function startEdit(s: Schedule) {
    setEditingId(s.id);
    setEditDate(new Date(s.date).toISOString().split("T")[0]);
    setEditTitle(s.title ?? "");
    setEditNotes(s.notes ?? "");
    setEditIsHoliday(s.isHoliday);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleEditSchedule(e: React.FormEvent, id: string) {
    e.preventDefault();
    setEditSaving(true);
    const res = await fetch(`/api/schedules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: editDate,
        title: editTitle || null,
        notes: editNotes || null,
        isHoliday: editIsHoliday,
      }),
    });
    setEditSaving(false);
    if (res.ok) {
      toast({ title: "Schedule updated" });
      setEditingId(null);
      router.refresh();
    } else {
      toast({ title: "Failed to update schedule", variant: "destructive" });
    }
  }

  async function handleDeleteSchedule(id: string) {
    setDeleting(true);
    const res = await fetch(`/api/schedules/${id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      toast({ title: "Schedule deleted" });
      setConfirmDeleteId(null);
      router.refresh();
    } else {
      toast({ title: "Failed to delete schedule", variant: "destructive" });
    }
  }

  async function handleAbsenceAction(
    absenceId: string,
    status: "APPROVED" | "REJECTED"
  ) {
    setActionLoading(absenceId);
    const adminNote = adminNotes[absenceId] || undefined;
    const res = await fetch(`/api/absences/${absenceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, adminNote }),
    });
    setActionLoading(null);
    if (res.ok) {
      toast({ title: `Absence ${status.toLowerCase()}` });
      setAdminNotes((prev) => {
        const next = { ...prev };
        delete next[absenceId];
        return next;
      });
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
      const data = await res.json().catch(() => ({}));
      toast({
        title: data.error ?? "Failed to create schedule",
        variant: "destructive",
      });
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
          Add Service Date
        </Button>
      </div>

      {/* Add schedule form */}
      {showAddForm && (
        <Card className="border-dashed border-blue-300">
          <CardContent className="p-4">
            <form onSubmit={handleAddSchedule} className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Date
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
        <Card
          key={s.id}
          className={cn(s.isHoliday && "border-amber-200")}
        >
          <CardContent className="p-4">
            {/* ── Edit mode ───────────────────────────────────────── */}
            {editingId === s.id ? (
              <form
                onSubmit={(e) => handleEditSchedule(e, s.id)}
                className="space-y-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-gray-700">
                    Edit Schedule
                  </span>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="p-1 rounded hover:bg-gray-100"
                  >
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Title (optional)
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="e.g. Palm Sunday"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Notes (optional)
                  </label>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    rows={2}
                    placeholder="Additional notes..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`holiday-${s.id}`}
                    checked={editIsHoliday}
                    onChange={(e) => setEditIsHoliday(e.target.checked)}
                    className="rounded"
                  />
                  <label
                    htmlFor={`holiday-${s.id}`}
                    className="text-sm text-gray-700"
                  >
                    Mark as Holiday
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={cancelEdit}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={editSaving}>
                    {editSaving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            ) : confirmDeleteId === s.id ? (
              /* ── Delete confirmation ──────────────────────────── */
              <div className="space-y-3">
                <p className="text-sm text-gray-700">
                  Delete{" "}
                  <span className="font-semibold">
                    {formatShortDate(new Date(s.date))}
                  </span>
                  ? This will also remove all associated absences.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deleting}
                    onClick={() => handleDeleteSchedule(s.id)}
                  >
                    {deleting ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </div>
            ) : (
              /* ── Normal view ──────────────────────────────────── */
              <>
                <div className="flex items-center justify-between">
                  <button
                    className="flex-1 text-left"
                    onClick={() =>
                      setExpanded((prev) => (prev === s.id ? null : s.id))
                    }
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm">
                        {formatShortDate(new Date(s.date))}
                      </span>
                      {s.isHoliday && (
                        <Badge variant="warning">Holiday</Badge>
                      )}
                      {s.title && (
                        <span className="text-gray-500 text-xs">
                          {s.title}
                        </span>
                      )}
                    </div>
                  </button>

                  <div className="flex items-center gap-2">
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

                    {/* Edit / Delete buttons */}
                    <button
                      onClick={() => startEdit(s)}
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Edit schedule"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(s.id)}
                      className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                      title="Delete schedule"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() =>
                        setExpanded((prev) => (prev === s.id ? null : s.id))
                      }
                    >
                      {expanded === s.id ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Notes preview */}
                {s.notes && (
                  <p className="text-xs text-gray-400 mt-1">{s.notes}</p>
                )}

                {/* Expanded absence list */}
                {expanded === s.id && (
                  <div className="mt-4 space-y-3 border-t pt-4">
                    {s.absentKakaks.length === 0 ? (
                      <p className="text-sm text-gray-400">
                        No absences submitted
                      </p>
                    ) : (
                      s.absentKakaks.map((a) => (
                        <div
                          key={a.absenceId}
                          className="bg-gray-50 rounded-lg px-3 py-2 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {a.user.name ?? a.user.email}
                              </p>
                              <p className="text-xs text-blue-600 font-medium">
                                {a.churchName} · {a.serviceTime} {a.serviceName}
                              </p>
                              {a.reason && (
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {a.reason}
                                </p>
                              )}
                              {a.adminNote && (
                                <p className="text-xs text-blue-600 mt-0.5">
                                  Note: {a.adminNote}
                                </p>
                              )}
                            </div>
                            <Badge variant={statusVariant[a.status]}>
                              {a.status}
                            </Badge>
                          </div>

                          {/* Approve / Reject with admin note */}
                          {a.status === "PENDING" && (
                            <div className="space-y-1.5">
                              <textarea
                                value={adminNotes[a.absenceId] ?? ""}
                                onChange={(e) =>
                                  setAdminNotes((prev) => ({
                                    ...prev,
                                    [a.absenceId]: e.target.value,
                                  }))
                                }
                                placeholder="Admin note (optional)..."
                                rows={1}
                                className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                              />
                              <div className="flex gap-1">
                                <button
                                  disabled={actionLoading === a.absenceId}
                                  onClick={() =>
                                    handleAbsenceAction(a.absenceId, "APPROVED")
                                  }
                                  className="flex items-center gap-1 text-xs text-green-700 bg-green-100 hover:bg-green-200 disabled:opacity-50 rounded px-2 py-0.5 font-medium"
                                >
                                  <Check className="w-3 h-3" />
                                  Approve
                                </button>
                                <button
                                  disabled={actionLoading === a.absenceId}
                                  onClick={() =>
                                    handleAbsenceAction(a.absenceId, "REJECTED")
                                  }
                                  className="flex items-center gap-1 text-xs text-red-700 bg-red-100 hover:bg-red-200 disabled:opacity-50 rounded px-2 py-0.5 font-medium"
                                >
                                  <X className="w-3 h-3" />
                                  Reject
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
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
