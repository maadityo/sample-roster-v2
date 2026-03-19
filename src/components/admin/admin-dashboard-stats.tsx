"use client";

import { formatShortDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminDashboardStatsProps {
  schedules: {
    id: string;
    date: string;
    title: string | null;
    isHoliday: boolean;
    absenceCount: number;
    isAtRisk: boolean;
  }[];
  kakaksAtRisk: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    monthlyCount: number;
    atLimit: boolean;
  }[];
  maxAbsencesPerSunday: number;
  maxAbsencesPerMonth: number;
}

export function AdminDashboardStats({
  schedules,
  kakaksAtRisk,
  maxAbsencesPerSunday,
  maxAbsencesPerMonth,
}: AdminDashboardStatsProps) {
  return (
    <div className="space-y-6">
      {/* Upcoming Sundays */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <span>Upcoming Sundays</span>
            <Badge variant="secondary">{schedules.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-gray-100">
            {schedules.map((s) => (
              <div
                key={s.id}
                className={cn(
                  "flex items-center justify-between px-6 py-3",
                  s.isHoliday && "bg-amber-50"
                )}
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {formatShortDate(new Date(s.date))}
                    {s.isHoliday && (
                      <span className="ml-2 text-amber-600 text-xs">(Holiday)</span>
                    )}
                  </p>
                  {s.title && (
                    <p className="text-xs text-gray-500">{s.title}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-gray-400" />
                  <span
                    className={cn(
                      "text-sm font-medium",
                      s.isAtRisk ? "text-red-600" : "text-gray-700"
                    )}
                  >
                    {s.absenceCount} absent
                  </span>
                  {s.isAtRisk ? (
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  )}
                </div>
              </div>
            ))}

            {schedules.length === 0 && (
              <p className="text-center text-gray-400 py-6 text-sm">
                No upcoming schedules
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Kakaks approaching limit */}
      {kakaksAtRisk.length > 0 && (
        <Card className="border-yellow-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-yellow-800">
              <AlertTriangle className="w-4 h-4" />
              Kakaks Approaching Absence Limit
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-yellow-100">
              {kakaksAtRisk.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between px-6 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {k.name ?? k.email}
                    </p>
                    <p className="text-xs text-gray-500">{k.email}</p>
                  </div>
                  <Badge variant={k.atLimit ? "destructive" : "warning"}>
                    {k.monthlyCount}/{maxAbsencesPerMonth} this month
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
