/**
 * Per-test-file setup — runs before and after each test file.
 * Cleans up tables between test files.
 */
import { beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

// Use a single Prisma instance for all tests
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ??
        "postgresql://kakak:kakak_secret@localhost:5432/kakak_test?schema=public",
    },
  },
});

/** Wipe all data (order matters for FK constraints) */
async function resetDatabase() {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.absence.deleteMany(),
    prisma.session.deleteMany(),
    prisma.account.deleteMany(),
    prisma.service.deleteMany(),
    prisma.church.deleteMany(),
    prisma.schedule.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});
