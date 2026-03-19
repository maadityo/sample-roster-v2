"use client";

import { useState, useEffect } from "react";
import { AbsenceStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import { formatShortDate, cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle,
  X,
  Info,
  Loader2,
} from "lucide-react";
import type { RecommendationResponse } from "@/types";

interface AbsenceSubmitModalProps {
  schedule: {
    id: string;
    date: string;
    title: string | null;
  };
  onClose: () => void;
  onSubmitted: (status: AbsenceStatus, id: string) => void;
}

export function AbsenceSubmitModal({
  schedule,
  onClose,
  onSubmitted,
}: AbsenceSubmitModalProps) {
  const [recommendation, setRecommendation] =
    useState<RecommendationResponse | null>(null);
  const [loadingRec, setLoadingRec] = useState(true);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch(`/api/recommendations?scheduleId=${schedule.id}`)
      .then((r) => r.json())
      .then(setRecommendation)
      .catch(() => {})
      .finally(() => setLoadingRec(false));
  }, [schedule.id]);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/absences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleId: schedule.id, reason }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast({
          title: "Cannot submit absence",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      const absence = await res.json();
      toast({ title: "Absence submitted!" });
      onSubmitted(absence.status, absence.id);
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  const hasWarnings =
    recommendation?.willExceedPersonalLimit ||
    recommendation?.willExceedTeamLimit;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-bold text-gray-900">Submit Absence</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {formatShortDate(new Date(schedule.date))}
              {schedule.title ? ` · ${schedule.title}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Recommendation loading */}
          {loadingRec ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading recommendations...
            </div>
          ) : recommendation ? (
            <>
              {/* Personal quota */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    Monthly quota
                  </span>
                  <span
                    className={cn(
                      "text-sm font-bold",
                      recommendation.willExceedPersonalLimit
                        ? "text-red-600"
                        : recommendation.remainingMonthlyQuota === 1
                        ? "text-yellow-600"
                        : "text-green-600"
                    )}
                  >
                    {recommendation.currentMonthAbsenceCount} /{" "}
                    {recommendation.currentMonthAbsenceCount +
                      recommendation.remainingMonthlyQuota}{" "}
                    used
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      recommendation.willExceedPersonalLimit
                        ? "bg-red-500"
                        : recommendation.remainingMonthlyQuota === 1
                        ? "bg-yellow-500"
                        : "bg-green-500"
                    )}
                    style={{
                      width: `${Math.min(
                        100,
                        ((recommendation.currentMonthAbsenceCount + 1) /
                          (recommendation.currentMonthAbsenceCount +
                            recommendation.remainingMonthlyQuota)) *
                          100
                      )}%`,
                    }}
                  />
                </div>

                <p className="text-xs text-gray-500">
                  After submitting:{" "}
                  {recommendation.currentMonthAbsenceCount + 1} absence
                  {recommendation.currentMonthAbsenceCount + 1 !== 1 ? "s" : ""}{" "}
                  this month
                </p>
              </div>

              {/* Team coverage */}
              <div
                className={cn(
                  "rounded-xl p-4",
                  recommendation.willExceedTeamLimit
                    ? "bg-red-50"
                    : "bg-gray-50"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">
                    Team coverage on this Sunday
                  </span>
                  <span
                    className={cn(
                      "text-sm font-bold",
                      recommendation.willExceedTeamLimit
                        ? "text-red-600"
                        : "text-gray-700"
                    )}
                  >
                    {recommendation.absencesOnTargetSunday} absent
                  </span>
                </div>
                {recommendation.willExceedTeamLimit && (
                  <p className="text-xs text-red-600">
                    Team absence limit reached for this Sunday.
                  </p>
                )}
              </div>

              {/* Warnings */}
              {hasWarnings && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="text-sm font-semibold text-amber-900">
                      Warnings
                    </span>
                  </div>
                  {recommendation.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-800 ml-6">
                      {w}
                    </p>
                  ))}
                </div>
              )}

              {/* Alternative Sundays */}
              {recommendation.alternativeSundays.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Info className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium text-gray-700">
                      Other Sundays this month
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {recommendation.alternativeSundays.map((alt) => (
                      <div
                        key={alt.scheduleId}
                        className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
                      >
                        <span className="text-xs text-gray-700">
                          {formatShortDate(new Date(alt.date))}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            {alt.absenceCount} absent
                          </span>
                          {alt.isSafeForTeam ? (
                            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}

          {/* Reason input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Reason <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Family event, out of town..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : hasWarnings ? (
                "Submit Anyway"
              ) : (
                "Submit Absence"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
