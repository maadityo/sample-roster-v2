/**
 * Next.js Instrumentation Hook
 *
 * File ini dijalankan SEKALI saat Next.js server pertama kali start.
 * Kita pakai ini untuk load secrets dari Azure Key Vault sebelum
 * aplikasi mulai handle request.
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Hanya jalankan di server side (bukan di edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadSecretsFromKeyVault } = await import("@/lib/secrets");
    await loadSecretsFromKeyVault();
  }
}
