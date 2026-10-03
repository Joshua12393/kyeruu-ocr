/**
 * Role-Based Access Control (RBAC) Middleware
 * 
 * FIN-35: Restrict access to the Finance Module to 5 core roles.
 * FIN-40: Resolve user permissions based on current term officer assignments.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

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
 * Extracts and validates the current user from the request.
 * 
 * For now, user identity is passed via headers (X-User-Id).
 * In production, replace this with session/JWT-based authentication.
 */
export async function getAuthenticatedUser(
  req: NextRequest
): Promise<AuthenticatedUser | null> {
  const userIdHeader = req.headers.get("X-User-Id");
  if (!userIdHeader) return null;

  const userId = parseInt(userIdHeader, 10);
  if (isNaN(userId)) return null;

  // FIN-40: Look up the user's CURRENT term assignment
  const officerTerm = await prisma.officerTerm.findFirst({
    where: {
      user_id: userId,
      position: { in: FINANCE_POSITIONS },
    },
    orderBy: { id: "desc" }, // most recent term
    include: { user: true },
  });

  if (!officerTerm) return null;

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
  req: NextRequest,
  allowedPositions: AllowedPosition[]
): Promise<{ user: AuthenticatedUser } | NextResponse> {
  const user = await getAuthenticatedUser(req);

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
export function requireFinanceAccess(req: NextRequest) {
  return requirePosition(req, FINANCE_POSITIONS);
}

// Only Treasurer can delete records (FIN-27)
export function requireTreasurer(req: NextRequest) {
  return requirePosition(req, ["TREASURER"]);
}

// Only Auditor can verify/un-verify (FIN-19)
export function requireAuditor(req: NextRequest) {
  return requirePosition(req, ["AUDITOR"]);
}

// Treasurer + Assistant Treasurer can create/edit transactions
export function requireTransactionEditor(req: NextRequest) {
  return requirePosition(req, ["TREASURER", "ASSISTANT_TREASURER"]);
}
