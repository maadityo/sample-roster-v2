import { cn } from "@/lib/utils";

interface AbsenceQuotaBadgeProps {
  used: number;
  max: number;
}

export function AbsenceQuotaBadge({ used, max }: AbsenceQuotaBadgeProps) {
  const remaining = max - used;
  const atLimit = used >= max;
  const nearLimit = !atLimit && remaining <= 1;

  return (
    <div
      className={cn(
        "rounded-xl p-4 flex items-center justify-between",
        atLimit
          ? "bg-red-50 border border-red-200"
          : nearLimit
          ? "bg-yellow-50 border border-yellow-200"
          : "bg-blue-50 border border-blue-200"
      )}
    >
      <div>
        <p
          className={cn(
            "text-sm font-semibold",
            atLimit
              ? "text-red-900"
              : nearLimit
              ? "text-yellow-900"
              : "text-blue-900"
          )}
        >
          {atLimit
            ? "Absence limit reached"
            : nearLimit
            ? "Only 1 absence left this month"
            : "This month's absences"}
        </p>
        <p
          className={cn(
            "text-xs mt-0.5",
            atLimit
              ? "text-red-700"
              : nearLimit
              ? "text-yellow-700"
              : "text-blue-700"
          )}
        >
          {atLimit
            ? `You've used all ${max} absences for this month`
            : `${remaining} of ${max} remaining`}
        </p>
      </div>

      {/* Visual quota dots */}
      <div className="flex gap-1.5">
        {Array.from({ length: max }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "w-3 h-3 rounded-full",
              i < used
                ? atLimit
                  ? "bg-red-500"
                  : "bg-yellow-500"
                : "bg-gray-200"
            )}
          />
        ))}
      </div>
    </div>
  );
}
