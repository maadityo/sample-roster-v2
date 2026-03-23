"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AbsenceStatus } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import { cn, formatShortDate } from "@/lib/utils";
import { CalendarDays, Loader2, Users, AlertTriangle, X, CheckCircle2 } from "lucide-react";
import type { ScheduleWithChurches } from "@/types";
import { AbsenceQuotaBadge } from "@/components/kakak/absence-quota-badge";

interface AbsenceSubmitFormProps {
  schedules: ScheduleWithChurches[];
  initialAbsentScheduleIds: string[];
  max: number;
  currentMonthKey: string; // "2026-03"
  monthName: string; // "Maret"
}

const statusConfig: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  APPROVED: { label: "Approved", variant: "success" },
  PENDING: { label: "Pending", variant: "warning" },
  REJECTED: { label: "Rejected", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "secondary" },
};

export function AbsenceSubmitForm({ schedules: initialSchedules, initialAbsentScheduleIds, max, currentMonthKey, monthName }: AbsenceSubmitFormProps) {
  const [schedules, setSchedules] = useState(initialSchedules);
  const [absentScheduleIds, setAbsentScheduleIds] = useState<Set<string>>(() => new Set(initialAbsentScheduleIds));
  // dayChoice[scheduleId] = "YES" (ijin) | "NO" (hadir)
  const [dayChoice, setDayChoice] = useState<Record<string, "YES" | "NO">>({});
  // modalOpen = set of scheduleIds whose reason modal is open
  const [modalOpen, setModalOpen] = useState<Set<string>>(new Set());
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [submitError, setSubmitError] = useState<Record<string, string>>({});
  const [cancelLoading, setCancelLoading] = useState<Record<string, boolean>>({});
  // selectedServices[scheduleId] = set of serviceIds checked when "Tidak"
  const [selectedServices, setSelectedServices] = useState<Record<string, Set<string>>>({});
  // confirmedHadir = scheduleIds where user confirmed attendance
  const [confirmedHadir, setConfirmedHadir] = useState<Set<string>>(new Set());

  const { toast } = useToast();
  const router = useRouter();

  function selectChoice(scheduleId: string, choice: "YES" | "NO") {
    setDayChoice((prev) => ({ ...prev, [scheduleId]: choice }));
    if (choice === "YES") {
      setModalOpen((prev) => { const next = new Set(prev); next.add(scheduleId); return next; });
      setSelectedServices((prev) => { const next = { ...prev }; delete next[scheduleId]; return next; });
    } else {
      setModalOpen((prev) => { const next = new Set(prev); next.delete(scheduleId); return next; });
    }
  }

  function closeModal(scheduleId: string) {
    setModalOpen((prev) => { const next = new Set(prev); next.delete(scheduleId); return next; });
    setDayChoice((prev) => { const next = { ...prev }; delete next[scheduleId]; return next; });
    setSubmitError((prev) => { const next = { ...prev }; delete next[scheduleId]; return next; });
  }

  function toggleService(scheduleId: string, serviceId: string) {
    setSelectedServices((prev) => {
      const current = new Set(prev[scheduleId] ?? []);
      if (current.has(serviceId)) current.delete(serviceId);
      else current.add(serviceId);
      return { ...prev, [scheduleId]: current };
    });
  }

  function confirmHadir(scheduleId: string) {
    setConfirmedHadir((prev) => { const next = new Set(prev); next.add(scheduleId); return next; });
    setDayChoice((prev) => { const next = { ...prev }; delete next[scheduleId]; return next; });
    setSelectedServices((prev) => { const next = { ...prev }; delete next[scheduleId]; return next; });
    toast({ title: "Siap hadir! Terima kasih 🙏" });
  }

  async function handleSubmit(scheduleId: string) {
    const schedule = schedules.find((s) => s.id === scheduleId);
    if (!schedule) return;

    // Submit for every service that doesn't already have an active absence
    const servicesToSubmit = schedule.churches
      .flatMap((c) => c.services)
      .filter(
        (svc) =>
          !svc.myAbsence ||
          svc.myAbsence === "CANCELLED" ||
          svc.myAbsence === "REJECTED"
      );

    if (servicesToSubmit.length === 0) return;

    setLoading((prev) => ({ ...prev, [scheduleId]: true }));
    setSubmitError((prev) => { const next = { ...prev }; delete next[scheduleId]; return next; });
    const reason = reasons[scheduleId] ?? "";

    try {
      const results = await Promise.allSettled(
        servicesToSubmit.map((svc) =>
          fetch("/api/absences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scheduleId, serviceId: svc.id, reason }),
          }).then(async (res) => {
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error ?? "Failed");
            }
            return res.json() as Promise<{ id: string; serviceId: string; status: AbsenceStatus }>;
          })
        )
      );

      const succeeded = results.filter(
        (r): r is PromiseFulfilledResult<{ id: string; serviceId: string; status: AbsenceStatus }> =>
          r.status === "fulfilled"
      );
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");

      if (succeeded.length > 0) {
        setSchedules((prev) =>
          prev.map((s) => {
            if (s.id !== scheduleId) return s;
            return {
              ...s,
              churches: s.churches.map((c) => ({
                ...c,
                services: c.services.map((svc) => {
                  const match = succeeded.find((r) => r.value.serviceId === svc.id);
                  if (!match) return svc;
                  return {
                    ...svc,
                    myAbsence: match.value.status,
                    myAbsenceId: match.value.id,
                    absenceCount: svc.absenceCount + 1,
                  };
                }),
              })),
            };
          })
        );

        // Close modal and reset choice after successful submit
        setModalOpen((prev) => { const next = new Set(prev); next.delete(scheduleId); return next; });
        setDayChoice((prev) => { const next = { ...prev }; delete next[scheduleId]; return next; });

        // Update local monthly quota count if this schedule is in the current month
        const schedule = schedules.find((s) => s.id === scheduleId);
        if (schedule && schedule.date.slice(0, 7) === currentMonthKey) {
          setAbsentScheduleIds((prev) => new Set([...prev, scheduleId]));
        }

        toast({ title: "Ijin berhasil disubmit!" });
        router.refresh();
      }

      if (failed.length > 0) {
        const firstErr = (failed[0].reason as Error).message;
        setSubmitError((prev) => ({ ...prev, [scheduleId]: firstErr }));
        toast({ title: firstErr, variant: "destructive" });
      }
    } catch {
      setSubmitError((prev) => ({ ...prev, [scheduleId]: "Network error, coba lagi" }));
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setLoading((prev) => ({ ...prev, [scheduleId]: false }));
    }
  }

  async function handleCancelDay(scheduleId: string) {
    const schedule = schedules.find((s) => s.id === scheduleId);
    if (!schedule) return;

    // Collect all PENDING absences for this day
    const toCancel = schedule.churches
      .flatMap((c) => c.services)
      .filter((svc) => svc.myAbsenceId && svc.myAbsence === "PENDING");

    if (toCancel.length === 0) return;

    setCancelLoading((prev) => ({ ...prev, [scheduleId]: true }));
    try {
      await Promise.all(
        toCancel.map((svc) =>
          fetch(`/api/absences/${svc.myAbsenceId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "CANCELLED" }),
          })
        )
      );

      setSchedules((prev) =>
        prev.map((s) => {
          if (s.id !== scheduleId) return s;
          return {
            ...s,
            churches: s.churches.map((c) => ({
              ...c,
              services: c.services.map((svc) => {
                if (!toCancel.find((t) => t.id === svc.id)) return svc;
                return {
                  ...svc,
                  myAbsence: "CANCELLED" as AbsenceStatus,
                  absenceCount: Math.max(0, svc.absenceCount - 1),
                };
              }),
            })),
          };
        })
      );

      toast({ title: "Ijin dibatalkan" });
      setAbsentScheduleIds((prev) => {
        const next = new Set(prev);
        next.delete(scheduleId);
        return next;
      });
      router.refresh();
    } catch {
      toast({ title: "Failed to cancel", variant: "destructive" });
    } finally {
      setCancelLoading((prev) => ({ ...prev, [scheduleId]: false }));
    }
  }

  if (schedules.length === 0) {
    return <p className="text-center text-gray-400 py-8">No upcoming schedules</p>;
  }

  return (
    <>
      <AbsenceQuotaBadge used={absentScheduleIds.size} max={max} monthName={monthName} />

      <div className="space-y-4">
        {schedules.map((s) => {
          const date = new Date(s.date);
          const isUpcoming = date > new Date();
          const isLoading = loading[s.id] ?? false;
          const isCancelling = cancelLoading[s.id] ?? false;
          const choice = dayChoice[s.id];
          const isHadir = confirmedHadir.has(s.id);

          const allServices = s.churches.flatMap((c) => c.services);
          const activeAbsences = allServices.filter(
            (svc) => svc.myAbsenceId && svc.myAbsence !== "CANCELLED" && svc.myAbsence !== "REJECTED"
          );
          const isAbsentToday = activeAbsences.length > 0;
          const dayStatus = activeAbsences[0]?.myAbsence ?? null;
          const hasPendingToCancel = activeAbsences.some((svc) => svc.myAbsence === "PENDING");

          const checkedSvcs = selectedServices[s.id] ?? new Set<string>();
          const hasMinOne = checkedSvcs.size > 0;

          return (
            <Card
              key={s.id}
              className={cn(
                "transition-all",
                isAbsentToday && "border-blue-200",
                isHadir && "border-green-200",
                s.isHoliday && "border-amber-200 bg-amber-50/50"
              )}
            >
              <CardContent className="p-4 space-y-3">
                {/* ── Day header row ── */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <CalendarDays className="w-4 h-4 text-blue-500 shrink-0" />
                    <span className="font-semibold text-gray-900 text-sm">
                      {formatShortDate(date)}
                    </span>
                    {s.isHoliday && <Badge variant="warning" className="text-xs">Holiday</Badge>}
                    {s.title && (
                      <span className="text-gray-400 text-xs truncate">{s.title}</span>
                    )}
                  </div>

                  {/* Right: status+cancel for already-absent, Past for old, or Ya/Tidak buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isAbsentToday && dayStatus ? (
                      <>
                        <Badge variant={statusConfig[dayStatus]?.variant ?? "secondary"} className="text-xs">
                          {statusConfig[dayStatus]?.label ?? dayStatus}
                        </Badge>
                        {hasPendingToCancel && isUpcoming && (
                          <button
                            onClick={() => handleCancelDay(s.id)}
                            disabled={isCancelling}
                            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                          >
                            {isCancelling ? "..." : "Batalkan"}
                          </button>
                        )}
                      </>
                    ) : isHadir ? (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span className="text-xs text-green-600 font-medium">Hadir</span>
                        {isUpcoming && (
                          <button
                            onClick={() =>
                              setConfirmedHadir((prev) => {
                                const next = new Set(prev);
                                next.delete(s.id);
                                return next;
                              })
                            }
                            className="text-xs text-gray-400 hover:text-gray-600 ml-1"
                          >
                            Ubah
                          </button>
                        )}
                      </div>
                    ) : !isUpcoming ? (
                      <span className="text-xs text-gray-300">Past</span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400">Ijin?</span>
                        <button
                          onClick={() => selectChoice(s.id, "YES")}
                          disabled={isLoading}
                          className={cn(
                            "px-3 py-1 rounded-full text-xs font-medium transition-colors border",
                            choice === "YES"
                              ? "bg-red-500 text-white border-red-500"
                              : "bg-white text-red-500 border-red-300 hover:bg-red-50"
                          )}
                        >
                          Ya
                        </button>
                        <button
                          onClick={() => selectChoice(s.id, "NO")}
                          disabled={isLoading}
                          className={cn(
                            "px-3 py-1 rounded-full text-xs font-medium transition-colors border",
                            choice === "NO"
                              ? "bg-green-500 text-white border-green-500"
                              : "bg-white text-green-600 border-green-300 hover:bg-green-50"
                          )}
                        >
                          Tidak
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Service checkboxes when "Tidak" selected (not yet confirmed) ── */}
                {choice === "NO" && !isAbsentToday && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500">
                      Pilih service yang kamu ikuti{" "}
                      <span className="text-red-500">*</span>
                      <span className="text-gray-400"> (min. 1)</span>
                    </p>
                    {s.churches.map((church) => (
                      <div key={church.id}>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                          {church.name}
                        </p>
                        <div className="space-y-1">
                          {church.services.map((svc) => {
                            const isChecked = checkedSvcs.has(svc.id);
                            const full = svc.absenceCount >= 3;
                            return (
                              <label
                                key={svc.id}
                                className={cn(
                                  "flex items-center justify-between rounded-md px-2.5 py-2 cursor-pointer transition-colors border",
                                  isChecked
                                    ? "bg-green-50 border-green-200"
                                    : "bg-gray-50 border-transparent hover:bg-gray-100"
                                )}
                              >
                                <div className="flex items-center gap-2.5">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleService(s.id, svc.id)}
                                    className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                                  />
                                  <span className="text-xs text-gray-700">
                                    <span className="text-gray-400 mr-1">{svc.time}</span>
                                    {svc.name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Users className="w-3 h-3 text-gray-400" />
                                  <span className={cn("text-xs", full ? "text-red-600 font-medium" : "text-gray-400")}>
                                    {svc.absenceCount} absent
                                  </span>
                                  {full && <AlertTriangle className="w-3 h-3 text-red-500" />}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                      <span className="text-xs text-gray-400">
                        {hasMinOne ? `${checkedSvcs.size} service dipilih` : "Pilih minimal 1 service"}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setDayChoice((prev) => {
                              const next = { ...prev };
                              delete next[s.id];
                              return next;
                            })
                          }
                        >
                          Batal
                        </Button>
                        <Button
                          size="sm"
                          disabled={!hasMinOne}
                          onClick={() => confirmHadir(s.id)}
                          className="bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white gap-1.5"
                        >
                          Konfirmasi Hadir
                        </Button>
                      </div>
                    </div>
                  </div>
                )}


              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Reason modal — rendered outside cards ── */}
      {schedules.map((s) => {
        const isOpen = modalOpen.has(s.id);
        if (!isOpen) return null;
        const isLoading = loading[s.id] ?? false;
        const errMsg = submitError[s.id];
        const date = new Date(s.date);
        return (
          <div
            key={`modal-${s.id}`}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) closeModal(s.id); }}
          >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">Pengajuan Ijin</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{formatShortDate(date)}</p>
                </div>
                <button
                  onClick={() => closeModal(s.id)}
                  className="rounded-full p-1 hover:bg-gray-100 transition-colors"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Alasan ijin
                </label>
                <textarea
                  rows={3}
                  value={reasons[s.id] ?? ""}
                  onChange={(e) =>
                    setReasons((prev) => ({ ...prev, [s.id]: e.target.value }))
                  }
                  placeholder="Tulis alasan ijin kamu di sini..."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  autoFocus
                />
                {errMsg && (
                  <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {errMsg}
                  </p>
                )}
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => closeModal(s.id)}
                  disabled={isLoading}
                >
                  Batal
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleSubmit(s.id)}
                  disabled={isLoading}
                  className="gap-1.5"
                >
                  {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Submit Ijin
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
