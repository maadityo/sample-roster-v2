/**
 * Global setup — runs ONCE before the entire test suite.
 * Handles Prisma migration on the test database.
 */
import { execSync } from "child_process";

export async function setup() {
  const testDb =
    process.env.TEST_DATABASE_URL ??
    "postgresql://kakak:kakak_secret@localhost:5432/kakak_test?schema=public";

  // Apply migrations to the test DB
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: testDb },
    stdio: "pipe",
  });
}

export async function teardown() {
  // Nothing to do — keep DB for inspection after failures
}
