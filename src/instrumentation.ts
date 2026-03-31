/**
 * Next.js Instrumentation Hook
 *
 * File ini dijalankan SEKALI saat Next.js server pertama kali start.
 * Urutan:
 *   1. Load app secrets dari Azure Key Vault (NEXTAUTH_SECRET, Google OAuth)
 *   2. Compose DATABASE_URL via Entra ID token (passwordless PostgreSQL)
 *   3. Run Prisma migrate deploy (idempotent — aman kalau sudah applied)
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Hanya jalankan di server side (bukan di edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadSecretsFromKeyVault, getDatabaseUrl } = await import("@/lib/secrets");

    // 1. Load app secrets (NEXTAUTH_SECRET, Google OAuth) from Key Vault
    await loadSecretsFromKeyVault();

    // 2. Compose DATABASE_URL via Entra ID token (skip if already set, e.g. local dev)
    await getDatabaseUrl();

    // 3. Run Prisma migrations (idempotent — no-op if already up to date)
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
