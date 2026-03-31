/**
 * Azure Key Vault + Entra ID — Secret & Database Credential Loader
 *
 * KV URI  : https://akv-prod-eau-01.vault.azure.net/
 *
 * Cara kerja:
 * - Di LOCAL : `az login` dulu → DefaultAzureCredential pakai Azure CLI token
 * - Di AZURE : aktifkan Managed Identity → TANPA password / credential apapun
 *
 * ── Daftar secret di Key Vault (3 app secrets) ───────────────────────────────
 *   sc-nextauth-kakak-sec → NEXTAUTH_SECRET
 *   sc-goauth-client-id   → GOOGLE_CLIENT_ID
 *   sc-goauth-client-sc   → GOOGLE_CLIENT_SECRET
 *
 * ── Database (passwordless via Entra ID) ──────────────────────────────────────
 *   POSTGRES_HOST env var → hostname (bukan secret, set di Container App env)
 *   Managed Identity      → Entra ID token sebagai password (otomatis, short-lived)
 *
 * ── Yang TIDAK dari Key Vault (set via env var biasa) ─────────────────────────
 *   NEXTAUTH_URL          → set manual di .env / docker-compose (bukan secret)
 *   POSTGRES_HOST         → set di Container App env (bukan secret)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { SecretClient } from "@azure/keyvault-secrets";
import { DefaultAzureCredential } from "@azure/identity";

// Secret yang langsung di-map ke env var (1 secret = 1 env var)
const DIRECT_SECRET_MAP: Record<string, string> = {
  "sc-nextauth-kakak-sec": "NEXTAUTH_SECRET",
  "sc-goauth-client-id": "GOOGLE_CLIENT_ID",
  "sc-goauth-client-sc": "GOOGLE_CLIENT_SECRET",
};

// Entra ID scope for Azure Database for PostgreSQL
const POSTGRES_ENTRA_SCOPE = "https://ossrdbms-aad.database.windows.net/.default";

let loaded = false;

// Shared credential instance — reused by Key Vault and Entra DB token
let _credential: DefaultAzureCredential | null = null;

function getCredential(): DefaultAzureCredential {
  if (!_credential) {
    _credential = new DefaultAzureCredential();
  }
  return _credential;
}

/**
 * Ambil semua secret dari Key Vault dan inject ke process.env.
 * Dipanggil sekali saat server start (via instrumentation.ts).
 *
 * Jika AZURE_KEY_VAULT_URL tidak di-set, skip — app pakai env vars langsung.
 */
export async function loadSecretsFromKeyVault(): Promise<void> {
  if (loaded) return;

  const vaultUrl = process.env.AZURE_KEY_VAULT_URL;
  if (!vaultUrl) {
    console.log("[secrets] AZURE_KEY_VAULT_URL not set — using env vars directly");
    loaded = true;
    return;
  }

  try {
    const credential = getCredential();
    const client = new SecretClient(vaultUrl, credential);

    console.log(`[secrets] Connecting to Key Vault: ${vaultUrl}`);

    // ── Load direct-mapped secrets (3 app secrets) ─────────────────────────
    const directResults = await Promise.allSettled(
      Object.entries(DIRECT_SECRET_MAP).map(async ([secretName, envKey]) => {
        if (process.env[envKey]) {
          console.log(`[secrets] ${envKey} – already set, skipping`);
          return;
        }
        const secret = await client.getSecret(secretName);
        if (secret.value) {
          process.env[envKey] = secret.value;
          console.log(`[secrets] ${envKey} ← ${secretName} ✓`);
        } else {
          console.warn(`[secrets] ${secretName} – secret exists but value is empty`);
        }
      })
    );

    directResults.forEach((result, i) => {
      if (result.status === "rejected") {
        const name = Object.keys(DIRECT_SECRET_MAP)[i];
        console.error(`[secrets] Failed to load "${name}":`, result.reason);
      }
    });

    console.log("[secrets] Done ✓");
  } catch (err) {
    console.error("[secrets] Failed to connect to Key Vault:", err);
  }

  loaded = true;
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
