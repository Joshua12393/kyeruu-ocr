import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import prisma from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

export const authOptions: NextAuthOptions = {
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  providers: [CredentialsProvider({
    name: "Officer account",
    credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
    async authorize(credentials) {
      if (!credentials?.email || !credentials.password) return null;
      if (credentials.email.length > 255 || credentials.password.length > 256) return null;
      let user;
      try { user = await prisma.user.findUnique({ where: { email: credentials.email.trim().toLowerCase() } }); }
      catch { throw new Error("ServiceUnavailable"); }
      if (!user || !user.is_active || user.deleted_at || !await verifyPassword(credentials.password, user.password_hash)) return null;
      return { id: String(user.id), name: user.name, email: user.email, authVersion: user.auth_version };
    },
  })],
  callbacks: {
    async jwt({ token, user }) { if (user) { token.userId = user.id; token.authVersion = user.authVersion; } return token; },
    async session({ session, token }) {
      if (session.user && typeof token.userId === "string") session.user.id = token.userId;
      session.user.authVersion = typeof token.authVersion === "number" ? token.authVersion : 0;
      return session;
    },
  },
};
