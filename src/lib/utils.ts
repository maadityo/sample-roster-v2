import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, isAfter, startOfDay } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatSundayDate(date: Date | string): string {
  return format(new Date(date), "EEEE, d MMMM yyyy");
}

export function formatShortDate(date: Date | string): string {
  return format(new Date(date), "d MMM yyyy");
}

export function isUpcoming(date: Date | string): boolean {
  return isAfter(new Date(date), startOfDay(new Date()));
}

export function getAbsenceStatusColor(
  status: string
): "green" | "yellow" | "red" | "gray" {
  switch (status) {
    case "APPROVED":
      return "green";
    case "PENDING":
      return "yellow";
    case "REJECTED":
      return "red";
    case "CANCELLED":
      return "gray";
    default:
      return "gray";
  }
}
