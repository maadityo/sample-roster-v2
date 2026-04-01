/**
 * Entra ID — Passwordless Database Credential Loader
 *
 * Cara kerja:
 * - Di LOCAL : DATABASE_URL di-set via .env (password biasa)
 * - Di AZURE : Managed Identity → Entra ID token → password PostgreSQL (otomatis)
 *
 * ── App secrets (AUTH_SECRET, Google OAuth) ────────────────────────────────────
 *   Disimpan sebagai Container Apps secrets (encrypted at rest).
 *   Di-set via CI dari GitHub Secrets → `az containerapp secret set`.
 *   Visible sebagai env var ke semua runtime (Edge + Node.js).
 *
 * ── Database (passwordless via Entra ID) ──────────────────────────────────────
 *   POSTGRES_HOST env var → hostname (set di Container App env)
 *   Managed Identity      → Entra ID token sebagai password (otomatis, short-lived)
 *
 * ── Yang TIDAK secret (set via env var biasa) ─────────────────────────────────
 *   NEXTAUTH_URL          → set manual di .env / docker-compose
 *   POSTGRES_HOST         → set di Container App env
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { DefaultAzureCredential } from "@azure/identity";

// Entra ID scope for Azure Database for PostgreSQL
const POSTGRES_ENTRA_SCOPE = "https://ossrdbms-aad.database.windows.net/.default";

// Shared credential instance — reused across calls
let _credential: DefaultAzureCredential | null = null;

function getCredential(): DefaultAzureCredential {
  if (!_credential) {
    _credential = new DefaultAzureCredential();
  }
  return _credential;
}

/**
 * Compose DATABASE_URL menggunakan Entra ID token (passwordless).
 *
 * Di PRODUCTION: Managed Identity → Entra token → dipakai sebagai password PostgreSQL
 * Di LOCAL DEV : DATABASE_URL sudah di-set langsung via .env (password biasa)
 *
 * Dipanggil sekali dari instrumentation.ts sebelum Prisma migrate + server start.
 */
export async function getDatabaseUrl(): Promise<void> {
  if (process.env.DATABASE_URL) {
    console.log("[db] DATABASE_URL already set — skipping Entra token");
    return;
  }

  const host = process.env.POSTGRES_HOST;
  if (!host) {
    console.warn("[db] POSTGRES_HOST not set — cannot compose DATABASE_URL");
    return;
  }

  try {
    const credential = getCredential();
    const tokenResponse = await credential.getToken(POSTGRES_ENTRA_SCOPE);
    const token = encodeURIComponent(tokenResponse.token);
    const dbName = process.env.POSTGRES_DB ?? "kakak";
    const dbUser = process.env.POSTGRES_USER ?? "umi-kakak-prod-01";

    process.env.DATABASE_URL =
      `postgresql://${dbUser}:${token}@${host}/${dbName}?schema=public&sslmode=require`;
    console.log("[db] DATABASE_URL composed via Entra ID token ✓");
  } catch (err) {
    console.error("[db] Failed to acquire Entra token for PostgreSQL:", err);
  }
}
