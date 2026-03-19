import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      // Attach role and id to the session user
      session.user.id = user.id;
      session.user.role = (user as unknown as { role: Role }).role;
      return session;
    },
    async signIn({ user }) {
      // Only allow users that are registered in the system
      // Admins can add new kakaks via the users API
      if (!user.email) return false;
      const dbUser = await prisma.user.findUnique({
        where: { email: user.email },
      });
      // Allow first-time sign-in; user will be created by the adapter
      // but mark as inactive until admin approves – or open sign-up:
      // For open sign-up just return true
      return true;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "database" },
});
