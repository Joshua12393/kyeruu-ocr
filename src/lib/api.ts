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
  const settings = await tx.$queryRaw<{ current_term: string }[]>`SELECT current_term FROM oms_settings WHERE id = 1 FOR UPDATE`;
  const current = settings[0]?.current_term || process.env.FINANCE_CURRENT_TERM?.trim();
  const groups = await tx.$queryRaw<{ is_closed: boolean; academic_year: string }[]>`SELECT is_closed, academic_year FROM schedule_groups WHERE id = ${groupId} FOR UPDATE`;
  if (!groups.length) throw new ApiError(404, "Schedule group not found.");
  if (groups[0].is_closed) throw new ApiError(403, "This term is closed. Records cannot be changed.");
  if (groups[0].academic_year !== current) throw new ApiError(403, "Historical term records are read-only.");
  const { calendarWriteError } = await import("./terms");
  const restriction = calendarWriteError(await tx.academicTerm.findUnique({ where: { name: current! } }));
  if (restriction) throw new ApiError(403, restriction);
}

// Recheck with a locking read after the group lock: a concurrent side change
// must not allow a transaction to commit into the old direction.
export async function assertScheduleDirection(tx: Prisma.TransactionClient, id: number, direction: "INFLOW" | "OUTFLOW") {
  const sides = await tx.$queryRaw<{ type: string }[]>`SELECT type FROM schedules WHERE id = ${id} FOR UPDATE`;
  if (!sides.length || sides[0].type !== direction) throw new ApiError(409, "The schedule side changed. Reload and choose the correct direction.");
}
