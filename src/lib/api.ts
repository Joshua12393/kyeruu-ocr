import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function apiError(error: unknown) {
  if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Invalid request data", ...(error instanceof ZodError ? { details: error.issues } : {}) }, { status: 400 });
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return NextResponse.json({ error: "This control number or identifier already exists." }, { status: 409 });
    if (error.code === "P2025") return NextResponse.json({ error: "Record not found." }, { status: 404 });
    if (error.code === "P2003") return NextResponse.json({ error: "Referenced record is missing or still in use." }, { status: 409 });
  }
  console.error(error);
  return NextResponse.json({ error: "The request could not be completed." }, { status: 500 });
}

// Every writer and the term-close operation take the same lock. This prevents
// a creation/edit checked before closure from committing after the term closes.
export async function lockOpenGroup(tx: Prisma.TransactionClient, groupId: number) {
  const groups = await tx.$queryRaw<{ is_closed: boolean }[]>`SELECT is_closed FROM schedule_groups WHERE id = ${groupId} FOR UPDATE`;
  if (!groups.length) throw new ApiError(404, "Schedule group not found.");
  if (groups[0].is_closed) throw new ApiError(403, "This term is closed. Records cannot be changed.");
}
