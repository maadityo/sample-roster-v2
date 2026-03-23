import { cn, formatShortDate } from "@/lib/utils";

export interface RosterSchedule {
  scheduleId: string;
  date: string;
  title: string | null;
  isHoliday: boolean;
  ijin: { id: string; name: string | null; email: string; reason: string | null }[];
  belumSubmit: { id: string; name: string | null; email: string }[];
  services: {
    serviceId: string;
    serviceTime: string;
    serviceName: string;
    churchName: string;
    hadir: { id: string; name: string | null; email: string }[];
  }[];
}

function KakakChip({
  name,
  email,
  variant,
  title,
}: {
  name: string | null;
  email: string;
  variant: "hadir" | "ijin" | "pending";
  title?: string;
}) {
  const label = name?.split(" ")[0] ?? email.split("@")[0];
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        variant === "hadir" && "bg-green-100 text-green-800",
        variant === "ijin" && "bg-red-100 text-red-700",
        variant === "pending" && "bg-gray-100 text-gray-400 italic"
      )}
    >
      {label}
    </span>
  );
}

export function AdminRosterTable({
  schedules,
  totalKakaks,
}: {
  schedules: RosterSchedule[];
  totalKakaks: number;
}) {
  if (schedules.length === 0) {
    return (
      <div className="text-center text-gray-400 py-16">
        <p className="text-4xl mb-2">📅</p>
        <p>Belum ada jadwal pelayanan bulan ini.</p>
        <p className="text-xs mt-1">
          Tambahkan jadwal di halaman{" "}
          <a href="/admin/schedules" className="text-blue-500 underline">
            Schedules
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {schedules.map((schedule) => {
        const date = new Date(schedule.date);
        const hadirCount =
          totalKakaks - schedule.ijin.length - schedule.belumSubmit.length;

        return (
          <div
            key={schedule.scheduleId}
            className={cn(
              "rounded-xl border bg-white overflow-hidden",
              schedule.isHoliday ? "border-amber-200" : "border-gray-200"
            )}
          >
            {/* Date header */}
            <div
              className={cn(
                "px-4 py-3 border-b flex items-center justify-between gap-2 flex-wrap",
                schedule.isHoliday
                  ? "bg-amber-50 border-amber-200"
                  : "bg-gray-50 border-gray-100"
              )}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-900 text-sm">
                  {formatShortDate(date)}
                </span>
                {schedule.title && (
                  <span className="text-xs text-gray-500">{schedule.title}</span>
                )}
                {schedule.isHoliday && (
                  <span className="text-xs text-amber-600 font-medium">Holiday</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs shrink-0">
                <span className="text-green-700 font-medium">{hadirCount} hadir</span>
                {schedule.ijin.length > 0 && (
                  <span className="text-red-600 font-medium">
                    {schedule.ijin.length} ijin
                  </span>
                )}
                {schedule.belumSubmit.length > 0 && (
                  <span className="text-gray-400">
                    {schedule.belumSubmit.length} belum submit
                  </span>
                )}
              </div>
            </div>

            <div className="divide-y divide-gray-100">
              {/* Ijin row */}
              {schedule.ijin.length > 0 && (
                <div className="px-4 py-2.5 flex items-start gap-3">
                  <span className="text-xs font-semibold text-red-500 w-28 shrink-0 pt-0.5">
                    Ijin
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {schedule.ijin.map((k) => (
                      <KakakChip
                        key={k.id}
                        name={k.name}
                        email={k.email}
                        variant="ijin"
                        title={k.reason ?? undefined}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Per-service hadir rows */}
              {schedule.services.map((svc) => (
                <div key={svc.serviceId} className="px-4 py-2.5 flex items-start gap-3">
                  <div className="w-28 shrink-0">
                    <p className="text-xs font-semibold text-gray-700">{svc.serviceTime}</p>
                    {schedule.services.some(
                      (s) => s.churchName !== svc.churchName
                    ) && (
                      <p className="text-[10px] text-gray-400 leading-tight">
                        {svc.churchName}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-400 leading-tight">
                      {svc.serviceName}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {svc.hadir.length > 0 ? (
                      svc.hadir.map((k) => (
                        <KakakChip
                          key={k.id}
                          name={k.name}
                          email={k.email}
                          variant="hadir"
                        />
                      ))
                    ) : (
                      <span className="text-xs text-gray-300 italic">—</span>
                    )}
                  </div>
                </div>
              ))}

              {/* Belum submit row */}
              {schedule.belumSubmit.length > 0 && (
                <div className="px-4 py-2.5 flex items-start gap-3 bg-gray-50/60">
                  <span className="text-xs font-semibold text-gray-400 w-28 shrink-0 pt-0.5">
                    Belum Submit
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {schedule.belumSubmit.map((k) => (
                      <KakakChip
                        key={k.id}
                        name={k.name}
                        email={k.email}
                        variant="pending"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
