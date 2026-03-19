/**
 * Azure Key Vault - Secret Loader
 *
 * KV URI  : https://akv-prod-eau-01.vault.azure.net/
 *
 * Cara kerja:
 * - Di LOCAL : `az login` dulu → DefaultAzureCredential pakai Azure CLI token
 * - Di AZURE : aktifkan Managed Identity → TANPA password / credential apapun
 *
 * ── Daftar secret di Key Vault ────────────────────────────────────────────────
 *   sc-nextauth-kakak-sec → NEXTAUTH_SECRET
 *   sc-goauth-client-id   → GOOGLE_CLIENT_ID
 *   sc-goauth-client-sc   → GOOGLE_CLIENT_SECRET
 *
 *   sc-db-kakak-ep        → hostname database (dicompose jadi DATABASE_URL)
 *   sc-kakak-db-user      → username database  (dicompose jadi DATABASE_URL)
 *   sc-kakak-db-pass      → password database  (dicompose jadi DATABASE_URL)
 *
 * ── Yang TIDAK dari Key Vault (set via env var biasa) ─────────────────────────
 *   NEXTAUTH_URL          → set manual di .env / docker-compose (bukan secret)
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

// Secret DB diambil terpisah lalu dicompose jadi DATABASE_URL
const DB_SECRETS = {
  endpoint: "sc-db-kakak-ep",
  username: "sc-kakak-db-user",
  password: "sc-kakak-db-pass",
} as const;

let loaded = false;

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
    // DefaultAzureCredential otomatis pilih auth yang tersedia:
    // 1. Managed Identity (production di Azure)
    // 2. Azure CLI  (local dev setelah `az login`)
    // 3. VS Code credentials
    // 4. Environment variables AZURE_CLIENT_ID / AZURE_CLIENT_SECRET (CI/CD)
    const credential = new DefaultAzureCredential();
    const client = new SecretClient(vaultUrl, credential);

    console.log(`[secrets] Connecting to Key Vault: ${vaultUrl}`);

    // ── 1. Load direct-mapped secrets ──────────────────────────────────────
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

    // ── 2. Compose DATABASE_URL dari 3 secret DB ───────────────────────────
    if (!process.env.DATABASE_URL) {
      const [epResult, userResult, passResult] = await Promise.allSettled([
        client.getSecret(DB_SECRETS.endpoint),
        client.getSecret(DB_SECRETS.username),
        client.getSecret(DB_SECRETS.password),
      ]);

      const endpoint = epResult.status === "fulfilled" ? epResult.value.value : null;
      const username = userResult.status === "fulfilled" ? userResult.value.value : null;
      const password = passResult.status === "fulfilled" ? passResult.value.value : null;

      if (endpoint && username && password) {
        // encodeURIComponent agar karakter spesial di password tidak merusak URL
        const encodedPass = encodeURIComponent(password);
        const dbName = process.env.POSTGRES_DB ?? "kakak";
        process.env.DATABASE_URL =
          `postgresql://${username}:${encodedPass}@${endpoint}/${dbName}?schema=public`;
        console.log("[secrets] DATABASE_URL – composed from KV parts ✓");
      } else {
        // Log secret mana yang gagal
        if (epResult.status === "rejected")
          console.error(`[secrets] "${DB_SECRETS.endpoint}":`, epResult.reason);
        if (userResult.status === "rejected")
          console.error(`[secrets] "${DB_SECRETS.username}":`, userResult.reason);
        if (passResult.status === "rejected")
          console.error(`[secrets] "${DB_SECRETS.password}":`, passResult.reason);
        console.warn("[secrets] DATABASE_URL – could not be composed (check DB secrets above)");
      }
    } else {
      console.log("[secrets] DATABASE_URL – already set, skipping");
    }

    console.log("[secrets] Done ✓");
  } catch (err) {
    // Tidak di-throw — app tetap bisa jalan dengan env vars yang sudah ada
    console.error("[secrets] Failed to connect to Key Vault:", err);
  }

  loaded = true;
}
