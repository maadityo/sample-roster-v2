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

// ─── Church / Service shapes ─────────────────────────────────────────────────

export interface ServiceSlot {
  id: string;
  time: string;
  name: string;
  absenceCount: number;
  myAbsence: AbsenceStatus | null;
  myAbsenceId: string | null;
}

export interface ChurchWithServices {
  id: string;
  name: string;
  services: ServiceSlot[];
}

// ─── API response shapes ─────────────────────────────────────────────────────

export interface ScheduleWithChurches {
  id: string;
  date: string;
  title: string | null;
  notes: string | null;
  isHoliday: boolean;
  churches: ChurchWithServices[];
}

export interface AbsenceWithDetails {
  id: string;
  scheduleId: string;
  serviceId: string;
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
  upcomingSchedules: ScheduleWithChurches[];
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
