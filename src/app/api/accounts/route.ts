import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { adminAccountInput, accountChangeInput, accountDeleteInput, readAccountBody, requireSameOrigin } from "@/lib/accounts";
import { ApiError, apiError } from "@/lib/api";
import { currentTermName } from "@/lib/terms";
function roleType(role: string) { return role === "ADMIN" ? "ADMIN" as const : role === "ADVISER" ? "ADVISER" as const : role === "PENDING" ? "STUDENT" as const : "OFFICER" as const; }
export async function GET(req: Request) {
  try {
    const guard = await requireAdmin(req);
    if (guard instanceof NextResponse) return guard;
    const term = await currentTermName();
    const users = await prisma.user.findMany({ where: { deleted_at: null, email: { not: null }, password_hash: { not: null } }, select: { id: true, name: true, email: true, role_type: true, is_active: true, officer_terms: { where: { term }, orderBy: { id: "desc" }, take: 1, select: { position: true } } }, orderBy: { name: "asc" } });
    return NextResponse.json({ term, users: users.map(user => ({ id: user.id, name: user.name, email: user.email, is_active: user.is_active, role: user.role_type === "ADMIN" ? "ADMIN" : user.officer_terms[0]?.position === "OTHER" ? "PENDING" : user.officer_terms[0]?.position || "PENDING" })) });
  } catch (error) { return apiError(error); }
}
export async function POST(req: Request) {
  try {
    const guard = await requireAdmin(req);
    if (guard instanceof NextResponse) return guard;
    requireSameOrigin(req);
    const input = adminAccountInput.parse(await readAccountBody(req));
    const term = await currentTermName();
    const password_hash = await hashPassword(input.password);
    await prisma.$transaction(async tx => {
      await lockAdmins(tx, guard.user.id);
      await tx.user.create({ data: { name: input.name, email: input.email, password_hash, role_type: roleType(input.role), ...(!["ADMIN", "PENDING"].includes(input.role) ? { officer_terms: { create: { position: input.role as "ADVISER" | "PRESIDENT" | "TREASURER" | "ASSISTANT_TREASURER" | "AUDITOR", term } } } : {}) } });
    });
    return NextResponse.json({ message: "Account created successfully." }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "This email already has an account. Manage it from the account list." }, { status: 409 });
    return apiError(error);
  }
}
// Serialize access changes and recheck the acting admin inside the transaction.
async function lockAdmins(tx: Prisma.TransactionClient, actorId: number) {
  await tx.$queryRaw`SELECT id FROM users WHERE role_type = 'ADMIN' ORDER BY id FOR UPDATE`;
  const actor = await tx.user.findUnique({ where: { id: actorId } });
  if (!actor || actor.role_type !== "ADMIN" || !actor.is_active || actor.deleted_at) throw new ApiError(403, "Your admin access is no longer active.");
}
async function targetAccount(tx: Prisma.TransactionClient, actorId: number, targetId: number) {
  if (targetId === actorId) throw new ApiError(403, "Ask another admin to change or delete your own account.");
  const target = await tx.user.findUnique({ where: { id: targetId } });
  if (!target || target.deleted_at || !target.email || !target.password_hash) throw new ApiError(404, "Account not found.");
  if (target.role_type === "ADMIN" && target.is_active && await tx.user.count({ where: { role_type: "ADMIN", is_active: true, deleted_at: null } }) <= 1) throw new ApiError(409, "Keep at least one active admin account.");
  return target;
}
export async function PATCH(req: Request) {
  try {
    const guard = await requireAdmin(req);
    if (guard instanceof NextResponse) return guard;
    requireSameOrigin(req);
    const input = accountChangeInput.parse(await readAccountBody(req));
    await prisma.$transaction(async tx => {
      await lockAdmins(tx, guard.user.id);
      const target = await targetAccount(tx, guard.user.id, input.user_id);
      if (input.action === "status") {
        await tx.user.update({ where: { id: target.id }, data: { is_active: input.is_active, auth_version: { increment: 1 } } });
      } else {
        await tx.user.update({ where: { id: target.id }, data: { role_type: roleType(input.role) } });
        await tx.officerTerm.create({ data: { user_id: target.id, term: await currentTermName(), position: input.role === "ADMIN" || input.role === "PENDING" ? "OTHER" : input.role } });
      }
    });
    return NextResponse.json({ message: input.action === "role" ? "Account role updated." : input.is_active ? "Account reactivated. Sign in again to use it." : "Account deactivated. Existing access has been revoked." });
  } catch (error) { return apiError(error); }
}
export async function DELETE(req: Request) {
  try {
    const guard = await requireAdmin(req);
    if (guard instanceof NextResponse) return guard;
    requireSameOrigin(req);
    const input = accountDeleteInput.parse(await readAccountBody(req));
    await prisma.$transaction(async tx => {
      await lockAdmins(tx, guard.user.id);
      const target = await targetAccount(tx, guard.user.id, input.user_id);
      await tx.user.update({ where: { id: target.id }, data: { deleted_at: new Date(), is_active: false, email: null, password_hash: null, auth_version: { increment: 1 } } });
    });
    return NextResponse.json({ message: "Account deleted. Financial history has been retained." });
  } catch (error) { return apiError(error); }
}
