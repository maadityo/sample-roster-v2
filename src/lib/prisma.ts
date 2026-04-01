import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    // Pass datasourceUrl explicitly so it picks up the DATABASE_URL
    // set by instrumentation.ts (Entra ID token) at runtime.
    // Without this, Prisma may fail in standalone workers that missed
    // the process.env mutation from instrumentation.
    ...(process.env.DATABASE_URL ? { datasourceUrl: process.env.DATABASE_URL } : {}),
  });
}

// Lazy getter — defers PrismaClient construction until first use,
// which is AFTER instrumentation.ts has set DATABASE_URL.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createPrismaClient();
    }
    return (globalForPrisma.prisma as any)[prop];
  },
});
