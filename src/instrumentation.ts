/**
 * Next.js Instrumentation Hook
 *
 * File ini dijalankan SEKALI saat Next.js server pertama kali start.
 * Urutan:
 *   1. Compose DATABASE_URL via Entra ID token (passwordless PostgreSQL via Managed Identity)
 *   2. Run Prisma migrate deploy (idempotent — aman kalau sudah applied)
 *
 * App secrets (AUTH_SECRET, Google OAuth) di-set sebagai Container Apps secrets
 * (encrypted at rest) — sudah tersedia sebagai env var sebelum app start.
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Hanya jalankan di server side (bukan di edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getDatabaseUrl } = await import("@/lib/secrets");

    // 1. Compose DATABASE_URL via Entra ID token (skip if already set, e.g. local dev)
    await getDatabaseUrl();

    // 2. Run Prisma migrations (idempotent — no-op if already up to date)
    if (process.env.DATABASE_URL) {
      try {
        const { execSync } = await import("child_process");
        console.log("[migrate] Running prisma migrate deploy...");
        execSync("node node_modules/prisma/build/index.js migrate deploy", {
          stdio: "inherit",
          env: process.env,
        });
        console.log("[migrate] Done ✓");
      } catch (err) {
        // Non-fatal: migration mungkin sudah applied, atau DB belum ready
        console.error("[migrate] prisma migrate deploy failed:", err);
      }
    }
  }
}
