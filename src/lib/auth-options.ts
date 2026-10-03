import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import prisma from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  providers: [CredentialsProvider({
    name: "Officer account",
    credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
    async authorize(credentials) {
      if (!credentials?.email || !credentials.password) return null;
      const user = await prisma.user.findUnique({ where: { email: credentials.email.trim().toLowerCase() } });
      if (!user || !await verifyPassword(credentials.password, user.password_hash)) return null;
      return { id: String(user.id), name: user.name, email: user.email };
    },
  })],
  callbacks: {
    async jwt({ token, user }) { if (user) token.userId = user.id; return token; },
    async session({ session, token }) {
      if (session.user && typeof token.userId === "string") session.user.id = token.userId;
      return session;
    },
  },
};
