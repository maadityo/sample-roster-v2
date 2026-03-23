import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { authConfig } from "@/lib/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Izinkan pre-registered user (tanpa Account record) untuk link via OAuth
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  // JWT strategy agar role bisa dibaca di Edge Runtime (middleware)
  session: { strategy: "jwt" },
  callbacks: {
    // Tambahkan role + DB user ID ke JWT saat pertama kali login
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email },
          select: { id: true, role: true },
        });
        if (dbUser) {
          token.id = dbUser.id;   // selalu simpan DB user ID secara eksplisit
          token.role = dbUser.role;
        }
      }
      return token;
    },
    // Map JWT → session object; gunakan token.id (DB ID) jika ada
    async session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      else if (token.sub) session.user.id = token.sub;
      if (token.role) session.user.role = token.role as Role;
      return session;
    },
    async signIn({ user }) {
      // Izinkan semua akun Google — user dibuat otomatis oleh PrismaAdapter
      // Admin dapat menonaktifkan user via isActive = false jika diperlukan
      if (!user.email) return false;
      try {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email },
          select: { isActive: true },
        });
        // Jika sudah ada di DB tapi dinonaktifkan, tolak login
        if (dbUser !== null && !dbUser.isActive) return false;
        // User baru atau aktif → izinkan
        return true;
      } catch (err) {
        console.error("[signIn] Prisma error:", err);
        return false;
      }
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
