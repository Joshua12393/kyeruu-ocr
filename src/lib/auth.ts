/**
 * Role-Based Access Control (RBAC) Middleware
 * 
 * FIN-35: Restrict access to the Finance Module to 5 core roles.
 * FIN-40: Resolve user permissions based on current term officer assignments.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { applicationOrigin } from "@/lib/request-origin";
import { FINANCE_EDITORS } from "./capabilities";
import { currentTermName, calendarWriteError } from "./terms";

export type AllowedPosition =
  | "ADVISER"
  | "PRESIDENT"
  | "TREASURER"
  | "ASSISTANT_TREASURER"
  | "AUDITOR";

const FINANCE_POSITIONS: AllowedPosition[] = [
  "ADVISER",
  "PRESIDENT",
  "TREASURER",
  "ASSISTANT_TREASURER",
  "AUDITOR",
];

export interface AuthenticatedUser {
  id: number;
  name: string;
  position: AllowedPosition | "ADMIN";
  term: string;
  can_write: boolean;
  write_restriction: string | null;
}

/**
 * Extracts and validates the current user from the session.
 * Integrated with NextAuth for secure production access.
 */
export async function getSessionAccount() {
  const session = await getServerSession(authOptions);

  if (!session?.user) return null;

  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  const account = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role_type: true, is_active: true, deleted_at: true, auth_version: true } });
  if (!account || !account.is_active || account.deleted_at || account.auth_version !== session.user.authVersion) return null;
  return account;
}
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const account = await getSessionAccount();
  if (!account) return null;
  const currentTerm = await currentTermName().catch(() => null);
  if (account.role_type === "ADMIN") return { id: account.id, name: account.name, position: "ADMIN", term: currentTerm || "Not configured", can_write: false, write_restriction: null };
  if (!currentTerm) return null;

  // FIN-40: Look up the user's CURRENT term assignment
  const officerTerm = await prisma.officerTerm.findFirst({
    where: {
      user_id: account.id,
      term: currentTerm,
    },
    orderBy: { id: "desc" }, // most recent term
    include: { user: true },
  });

  if (!officerTerm || !FINANCE_POSITIONS.includes(officerTerm.position as AllowedPosition)) return null;

  const restriction = calendarWriteError(await prisma.academicTerm.findUnique({ where: { name: currentTerm } }));
  return {
    id: officerTerm.user.id,
    name: officerTerm.user.name,
    position: officerTerm.position as AllowedPosition,
    term: officerTerm.term,
    can_write: restriction === null,
    write_restriction: restriction,
  };
}

/**
 * Middleware guard: checks if the authenticated user holds one of the
 * required positions. Returns a 403 response if not.
 */
export async function requirePosition(
  req: Request,
  allowedPositions: (AllowedPosition | "ADMIN")[]
): Promise<{ user: AuthenticatedUser } | NextResponse> {
  const origin = req.headers.get("origin");
  if (!["GET", "HEAD"].includes(req.method) && origin && origin !== applicationOrigin(req)) {
    return NextResponse.json({ error: "Cross-origin writes are not allowed." }, { status: 403 });
  }
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized. You must be a Finance Module officer." },
      { status: 401 }
    );
  }

  // FIN-35: Only the 5 core roles can access the module
  if (!allowedPositions.includes(user.position)) {
    return NextResponse.json(
      {
        error: `Forbidden. Your role (${user.position}) does not have permission for this action.`,
      },
      { status: 403 }
    );
  }

  if (!["GET", "HEAD"].includes(req.method) && user.position !== "ADMIN" && !user.can_write) {
    return NextResponse.json({ error: user.write_restriction }, { status: 403 });
  }
  return { user };
}

/**
 * Convenience guards for common permission patterns.
 */

// Any finance officer can read
export function requireFinanceAccess(req: Request) {
  return requirePosition(req, FINANCE_POSITIONS);
}
export function requireAdmin(req: Request) {
  return requirePosition(req, ["ADMIN"]);
}

// Only Treasurer can delete records (FIN-27)
export function requireTreasurer(req: Request) {
  return requirePosition(req, ["TREASURER"]);
}

// Only Auditor can verify/un-verify (FIN-19)
export function requireAuditor(req: Request) {
  return requirePosition(req, ["AUDITOR"]);
}

// Editing and verification capabilities remain mutually exclusive.
export function requireTransactionEditor(req: Request) {
  return requirePosition(req, [...FINANCE_EDITORS]);
}
