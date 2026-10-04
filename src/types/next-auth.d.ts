import type { DefaultSession } from "next-auth";
declare module "next-auth" {
  interface User { authVersion?: number; }
  interface Session { user: DefaultSession["user"] & { id: string; authVersion: number }; }
}
