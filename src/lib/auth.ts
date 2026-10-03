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
  position: AllowedPosition;
  term: string;
}

/**
 * Extracts and validates the current user from the session.
 * Integrated with NextAuth for secure production access.
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const session = await getServerSession(authOptions);

  if (!session?.user) return null;

  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  const currentTerm = process.env.FINANCE_CURRENT_TERM?.trim();
  if (!currentTerm) return null;

  // FIN-40: Look up the user's CURRENT term assignment
  const officerTerm = await prisma.officerTerm.findFirst({
    where: {
      user_id: userId,
      term: currentTerm,
    },
    orderBy: { id: "desc" }, // most recent term
    include: { user: true },
  });

  if (!officerTerm || !FINANCE_POSITIONS.includes(officerTerm.position as AllowedPosition)) return null;

  return {
    id: officerTerm.user.id,
    name: officerTerm.user.name,
    position: officerTerm.position as AllowedPosition,
    term: officerTerm.term,
  };
}

/**
 * Middleware guard: checks if the authenticated user holds one of the
 * required positions. Returns a 403 response if not.
 */
export async function requirePosition(
  req: Request,
  allowedPositions: AllowedPosition[]
): Promise<{ user: AuthenticatedUser } | NextResponse> {
  const origin = req.headers.get("origin");
  if (!["GET", "HEAD"].includes(req.method) && origin && origin !== new URL(req.url).origin) {
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

  return { user };
}

/**
 * Convenience guards for common permission patterns.
 */

// Any finance officer can read
export function requireFinanceAccess(req: Request) {
  return requirePosition(req, FINANCE_POSITIONS);
}

// Only Treasurer can delete records (FIN-27)
export function requireTreasurer(req: Request) {
  return requirePosition(req, ["TREASURER"]);
}

// Only Auditor can verify/un-verify (FIN-19)
export function requireAuditor(req: Request) {
  return requirePosition(req, ["AUDITOR"]);
}

// Treasurer + Assistant Treasurer can create/edit transactions
export function requireTransactionEditor(req: Request) {
  return requirePosition(req, ["TREASURER", "ASSISTANT_TREASURER"]);
}
