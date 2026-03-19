// Business rule constants – also set in .env for runtime overrides
export const MAX_ABSENCES_PER_MONTH = Number(
  process.env.MAX_ABSENCES_PER_MONTH ?? 2
);
export const MAX_ABSENCES_PER_SUNDAY = Number(
  process.env.MAX_ABSENCES_PER_SUNDAY ?? 3
);
