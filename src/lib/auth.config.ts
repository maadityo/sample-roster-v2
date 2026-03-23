/**
 * auth.config.ts — Edge-compatible auth config
 *
 * File ini dipakai oleh middleware (Edge Runtime).
 * TIDAK boleh import Prisma, database, atau module Node.js berat.
 * auth.ts yang lengkap (dengan PrismaAdapter) dipakai di server components.
 */
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export const authConfig = {
  providers: [Google],
  // trustHost diperlukan di container/Docker agar NextAuth v5 menerima request
  // dari host yang di-set via NEXTAUTH_URL (misal localhost:3000)
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    // Di Edge, JWT sudah berisi id + role (ditambahkan oleh auth.ts saat login).
    // Gunakan token.id (DB user ID) jika ada, fallback ke token.sub.
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      else if (token.sub) session.user.id = token.sub;
      if (token.role) session.user.role = token.role as "ADMIN" | "KAKAK";
      return session;
    },
  },
} satisfies NextAuthConfig;
