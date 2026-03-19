import { Role, AbsenceStatus } from "@prisma/client";

// ─── Session augmentation ────────────────────────────────────────────────────
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: Role;
    };
  }
}

// ─── API response shapes ─────────────────────────────────────────────────────

export interface ScheduleWithAbsenceCounts {
  id: string;
  date: string;
  title: string | null;
  notes: string | null;
  isHoliday: boolean;
  absenceCount: number;
  myAbsence: AbsenceStatus | null;
}

export interface AbsenceWithDetails {
  id: string;
  scheduleId: string;
  scheduleDate: string;
  status: AbsenceStatus;
  reason: string | null;
  adminNote: string | null;
  isOverride: boolean;
  createdAt: string;
}

export interface KakakAbsenceSummary {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  monthlyCount: number;
  approachingLimit: boolean;
}

export interface AdminDashboardStats {
  upcomingSchedules: ScheduleWithAbsenceCounts[];
  kakaksApproachingLimit: KakakAbsenceSummary[];
  totalKakaks: number;
}

export interface RecommendationResponse {
  targetScheduleId: string;
  targetDate: string;
  currentMonthAbsenceCount: number;
  remainingMonthlyQuota: number;
  absencesOnTargetSunday: number;
  willExceedPersonalLimit: boolean;
  willExceedTeamLimit: boolean;
  alternativeSundays: {
    scheduleId: string;
    date: string;
    absenceCount: number;
    isSafeForTeam: boolean;
  }[];
  warnings: string[];
}
