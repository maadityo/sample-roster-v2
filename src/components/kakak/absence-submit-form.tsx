"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import { cn, formatShortDate } from "@/lib/utils";
import { CalendarDays, Loader2, CalendarCheck, CheckCircle2 } from "lucide-react";
import type { ScheduleWithChurches } from "@/types";
import { AbsenceQuotaBadge } from "@/components/kakak/absence-quota-badge";

interface AbsenceSubmitFormProps {
  /** Sundays only â€” pre-filtered by the server */
  schedules: ScheduleWithChurches[];
  initialAbsentScheduleIds: string[];
  max: number;
  monthName: string;
  /** True when the user already has PENDING/APPROVED absences for this month */
  hasSubmitted: boolean;
  /** Max kakaks allowed absent per Sunday; used to render the Penuh chip */
  maxPerSunday: number;
}

const statusConfig = {
  APPROVED:  { label: "Approved",  variant: "success"     as const },
  PENDING:   { label: "Pending",   variant: "warning"     as const },
  REJECTED:  { label: "Rejected",  variant: "destructive" as const },
  CANCELLED: { label: "Cancelled", variant: "secondary"   as const },
};

export function AbsenceSubmitForm({
  schedules,
  initialAbsentScheduleIds,
  max,
  maxPerSunday,
  monthName,
  hasSubmitted: initialHasSubmitted,
}: AbsenceSubmitFormProps) {
  const [absentScheduleIds, setAbsentScheduleIds] = useState(
    () => new Set(initialAbsentScheduleIds)
  );
  const [hasSubmitted, setHasSubmitted] = useState(initialHasSubmitted);

  // Pre-submit state: per-Sunday choices, selected services (for TIDAK/pelayanan), reasons
  const [dayChoice, setDayChoice] = useState<Record<string, "YES" | "NO">>({});
  // selectedServices: which services the kakak will attend on "Tidak" (hadir) days.
  const [selectedServices, setSelectedServices] = useState<Record<string, Set<string>>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Post-submit: per-absenceId cancel loading
  const [cancelLoading, setCancelLoading] = useState<Record<string, boolean>>({});

  const { toast } = useToast();
  const router = useRouter();

  // Submit is enabled when ≥1 "Ya" (absent) day is chosen and within monthly limit
  // "Tidak" days don't create records — service picker is informational only
  const yesEntries = Object.entries(dayChoice).filter(([, c]) => c === "YES");
  const isOverMonthlyLimit = yesEntries.length > max;
  const canSubmit = yesEntries.length > 0 && !isOverMonthlyLimit;

  function toggleService(scheduleId: string, serviceId: string) {
    setSelectedServices((prev) => {
      const current = new Set(prev[scheduleId] ?? []);
      current.has(serviceId) ? current.delete(serviceId) : current.add(serviceId);
      return { ...prev, [scheduleId]: current };
    });
  }

  async function handleBatchSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);

    // "Ya" = absent the whole Sunday → create absence for EVERY service on that day
    const tasks: { scheduleId: string; serviceId: string; reason: string | null }[] = [];
    for (const [scheduleId] of yesEntries) {
      const schedule = schedules.find((s) => s.id === scheduleId);
      if (!schedule) continue;
      const reason = reasons[scheduleId]?.trim() || null;
      const allServicesOnDay = schedule.churches.flatMap((c) => c.services);
      for (const svc of allServicesOnDay) {
        tasks.push({ scheduleId, serviceId: svc.id, reason });
      }
    }

    try {
      const results = await Promise.allSettled(
        tasks.map(({ scheduleId, serviceId, reason }) =>
          fetch("/api/absences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scheduleId, serviceId, reason }),
          }).then(async (res) => {
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error ?? "Gagal");
            }
            return res.json();
          })
        )
      );

      const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      const succeeded = results.filter((r) => r.status === "fulfilled");

      if (succeeded.length > 0) {
        setAbsentScheduleIds(
          (prev) => new Set([...prev, ...yesEntries.map(([id]) => id)])
        );
        setHasSubmitted(true);

        // Save service plans for "Tidak" (hadir) days with selected services
        const noEntries = Object.entries(dayChoice).filter(([, c]) => c === "NO");
        const planSaves = noEntries
          .filter(([id]) => (selectedServices[id]?.size ?? 0) > 0)
          .map(([id]) =>
            fetch("/api/schedule-plans", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ scheduleId: id, serviceIds: [...selectedServices[id]] }),
            })
          );
        if (planSaves.length > 0) await Promise.allSettled(planSaves);

        toast({ title: `Jadwal ${monthName} berhasil dikirim! 🎉` });
        router.refresh();
      }
      if (failed.length > 0) {
        toast({
          title: `${failed.length} gagal: ${(failed[0].reason as Error).message}`,
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Network error, coba lagi", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(scheduleId: string, absenceId: string) {
    setCancelLoading((prev) => ({ ...prev, [absenceId]: true }));
    try {
      const res = await fetch(`/api/absences/${absenceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Ijin dibatalkan" });
      setAbsentScheduleIds((prev) => {
        const next = new Set(prev);
        next.delete(scheduleId);
        return next;
      });
      router.refresh();
    } catch {
      toast({ title: "Gagal membatalkan", variant: "destructive" });
    } finally {
      setCancelLoading((prev) => ({ ...prev, [absenceId]: false }));
    }
  }

  if (schedules.length === 0) {
    return (
      <p className="text-center text-gray-400 py-8">
        Belum ada jadwal Minggu untuk bulan {monthName}
      </p>
    );
  }

  // â”€â”€â”€ POST-SUBMIT VIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (hasSubmitted) {
    return (
      <div className="space-y-4">
        <AbsenceQuotaBadge used={absentScheduleIds.size} max={max} monthName={monthName} />

        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CalendarCheck className="w-4 h-4 shrink-0" />
          <span>
            Jadwal <strong>{monthName}</strong> sudah disubmit
          </span>
        </div>

        <div className="space-y-3">
          {schedules.map((s) => {
            const date = new Date(s.date);
            const allServices = s.churches.flatMap((c) => c.services);
            const activeAbsences = allServices.filter(
              (svc) =>
                svc.myAbsenceId &&
                svc.myAbsence &&
                svc.myAbsence !== "CANCELLED" &&
                svc.myAbsence !== "REJECTED"
            );

            // Hadir: no absence record — show only the services the kakak selected (from DB)
            if (activeAbsences.length === 0) {
              const attendingIds = new Set(s.myServicePlan ?? []);
              const attendingServices = allServices.filter((svc) => attendingIds.has(svc.id));
              return (
                <Card key={s.id} className="border-green-100">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="w-4 h-4 text-blue-400" />
                        <span className="font-semibold text-sm text-gray-900">
                          {formatShortDate(date)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span className="text-xs font-medium text-green-600">Hadir</span>
                      </div>
                    </div>
                    {attendingServices.length > 0 && (
                      <div className="space-y-1 pl-6">
                        {attendingServices.map((svc) => (
                          <div key={svc.id} className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-400">{svc.time}</span>
                            <span className="text-xs text-gray-700">{svc.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            }

            // Ijin: has absence — show date + status badge + one Batalkan button only
            const topStatus = activeAbsences[0].myAbsence!;
            const hasCancellable = activeAbsences.some((svc) => svc.myAbsence === "PENDING" || svc.myAbsence === "APPROVED");
            const firstCancellableId = activeAbsences.find((svc) => svc.myAbsence === "PENDING" || svc.myAbsence === "APPROVED")?.myAbsenceId;
            return (
              <Card key={s.id} className="border-red-100">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-red-400" />
                      <span className="font-semibold text-sm text-gray-900">
                        {formatShortDate(date)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          statusConfig[topStatus as keyof typeof statusConfig]?.variant ??
                          "secondary"
                        }
                        className="text-xs"
                      >
                        {statusConfig[topStatus as keyof typeof statusConfig]?.label ?? topStatus}
                      </Badge>
                      {hasCancellable && firstCancellableId && (
                        <button
                          onClick={() => handleCancel(s.id, firstCancellableId)}
                          disabled={cancelLoading[firstCancellableId] ?? false}
                          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                        >
                          {cancelLoading[firstCancellableId] ? "..." : "Batalkan"}
                        </button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // â”€â”€â”€ PRE-SUBMIT VIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="space-y-4">
      <AbsenceQuotaBadge used={absentScheduleIds.size} max={max} monthName={monthName} />

      <div className="space-y-3">
        {schedules.map((s) => {
          const date = new Date(s.date);
          const choice = dayChoice[s.id];

          return (
            <Card
              key={s.id}
              className={cn(
                "transition-all",
                choice === "YES" && "border-red-200",
                choice === "NO" && "border-green-200"
              )}
            >
              <CardContent className="p-4 space-y-3">
                {/* Header row */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-blue-500" />
                    <div>
                      <span className="font-semibold text-sm text-gray-900">
                        {formatShortDate(date)}
                      </span>
                      {s.absentKakaks.length > 0 && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          Ijin: {s.absentKakaks.map((k) => k.name?.split(" ")[0] ?? "?").join(", ")}
                        </p>
                      )}
                    </div>
                  </div>

                  {s.isFullyBooked ? (
                    <span className="text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-3 py-1 whitespace-nowrap">
                      Penuh ({s.absentKakaks.length}/{maxPerSunday})
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400">Ijin?</span>
                      <button
                        onClick={() => {
                          setDayChoice((prev) => ({ ...prev, [s.id]: "YES" }));
                          // clear any "Tidak" service selection when switching to Ya
                          setSelectedServices((prev) => {
                            const next = { ...prev };
                            delete next[s.id];
                            return next;
                          });
                        }}
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                          choice === "YES"
                            ? "bg-red-500 text-white border-red-500"
                            : "bg-white text-red-500 border-red-300 hover:bg-red-50"
                        )}
                      >
                        Ya
                      </button>
                      <button
                        onClick={() => {
                          setDayChoice((prev) => ({ ...prev, [s.id]: "NO" }));
                          // clear reason when switching to Tidak
                          setReasons((prev) => { const next = { ...prev }; delete next[s.id]; return next; });
                        }}
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
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

                {/* Ya selected → absent whole Sunday, just show reason field */}
                {choice === "YES" && (
                  <div className="space-y-2 pt-1 border-t border-red-100">
                    <p className="text-xs text-red-600 font-medium">
                      Ijin seharian — tidak pelayanan hari ini
                    </p>
                    <textarea
                      rows={2}
                      value={reasons[s.id] ?? ""}
                      onChange={(e) =>
                        setReasons((prev) => ({ ...prev, [s.id]: e.target.value }))
                      }
                      placeholder="Alasan ijin (opsional)..."
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                    />
                  </div>
                )}

                {/* Tidak selected → will serve, show service attendance picker */}
                {choice === "NO" && (
                  <div className="space-y-2 pt-1 border-t border-green-100">
                    <p className="text-xs text-gray-500">
                      Pilih service yang akan kamu layani:
                    </p>
                    {s.churches.map((church) => (
                      <div key={church.id}>
                        {s.churches.length > 1 && (
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                            {church.name}
                          </p>
                        )}
                        <div className="space-y-1">
                          {church.services.map((svc) => {
                            const isChecked = (selectedServices[s.id] ?? new Set()).has(svc.id);
                            return (
                              <label
                                key={svc.id}
                                className={cn(
                                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 cursor-pointer border transition-colors",
                                  isChecked
                                    ? "bg-green-50 border-green-200"
                                    : "bg-gray-50 border-transparent hover:bg-gray-100"
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleService(s.id, svc.id)}
                                  className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-400"
                                />
                                <span className="text-xs text-gray-700">
                                  <span className="text-gray-400 mr-1">{svc.time}</span>
                                  {svc.name}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Over-limit error banner */}
      {isOverMonthlyLimit && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm">
          <p className="font-semibold text-red-700">
            Maksimal ijin adalah <strong>{max}x</strong> sebulan.
          </p>
          <p className="text-xs text-red-500 mt-0.5">
            Jika butuh lebih dari {max}x, tolong kontak Kakak Leader.
          </p>
        </div>
      )}

      {/* Bottom submit button */}
      <div className="pb-4">
        <Button
          className="w-full gap-2"
          disabled={!canSubmit || submitting}
          onClick={handleBatchSubmit}
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {submitting ? "Mengirim..." : `Kirim Jadwal ${monthName}`}
        </Button>
        {yesEntries.length === 0 && (
          <p className="text-center text-xs text-gray-400 mt-2">
            Pilih &ldquo;Ya&rdquo; untuk hari yang kamu tidak bisa hadir
          </p>
        )}
      </div>
    </div>
  );
}
