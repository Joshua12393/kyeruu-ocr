import { Prisma } from "@prisma/client";
import prisma from "./prisma";
import { ApiError, lockOpenGroup } from "./api";
import { calendarWriteError } from "./terms";
import type { AuthenticatedUser } from "./auth";
export type Tx = Prisma.TransactionClient;
export type PrimaryKind = "DV" | "AR";
export const snapshot = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export function assertVersion(current: { version: number }, version: number) {
  if (current.version !== version) throw new ApiError(409, "This record changed. Your draft was not saved. Review the latest record before retrying.", { code: "VERSION_CONFLICT", current_version: current.version, current: snapshot(current) });
}
export async function financeMutation<T>(user: AuthenticatedUser, work: (tx: Tx) => Promise<T>) {
  return prisma.$transaction(async tx => {
    const settings = await tx.$queryRaw<{ current_term: string }[]>`SELECT current_term FROM oms_settings WHERE id = 1 FOR UPDATE`;
    const name = settings[0]?.current_term || process.env.FINANCE_CURRENT_TERM?.trim();
    if (!name || name !== user.term) throw new ApiError(409, "The current officer term changed. Reload before saving.");
    const terms = await tx.$queryRaw<{ starts_on: Date | null; ends_on: Date | null; closed_at: Date | null }[]>`SELECT starts_on, ends_on, closed_at FROM academic_terms WHERE name = ${name} FOR UPDATE`;
    const restriction = calendarWriteError(terms[0] || null);
    if (restriction) throw new ApiError(403, restriction);
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
    const actor = await tx.user.findUnique({ where: { id: user.id } });
    const assignment = await tx.officerTerm.findFirst({ where: { user_id: user.id, term: name }, orderBy: { id: "desc" } });
    if (!actor?.is_active || actor.deleted_at || actor.auth_version !== user.auth_version || actor.role_type === "ADMIN" || assignment?.position !== user.position) throw new ApiError(403, "Your officer access changed. Reload before saving.");
    return work(tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 15000 });
}
export async function validateTermDate(tx: Tx, term: string, date: string) {
  const calendar = await tx.academicTerm.findUnique({ where: { name: term } });
  if (!calendar?.starts_on || !calendar.ends_on) throw new ApiError(403, "Configure the term calendar before saving financial records.");
  if (date < calendar.starts_on.toISOString().slice(0, 10) || date > calendar.ends_on.toISOString().slice(0, 10)) throw new ApiError(400, "The document date must fall within its term calendar.", { field: "date" });
}
export async function auditMutation(tx: Tx, userId: number, target_type: string, target_id: number, action: string, before: unknown, after: unknown) {
  await tx.financialMutation.create({ data: { user_id: userId, target_type, target_id, action, before: before == null ? Prisma.DbNull : snapshot(before), after: after == null ? Prisma.DbNull : snapshot(after) } });
}
export async function primary(tx: Tx, kind: PrimaryKind, id: number) {
  const row = kind === "DV" ? await tx.disbursementVoucher.findUnique({ where: { id }, include: { schedule: { include: { group: true } } } }) : await tx.acknowledgementReceipt.findUnique({ where: { id }, include: { schedule: { include: { group: true } } } });
  if (!row || row.deleted_at) throw new ApiError(404, "Active transaction not found.");
  return row;
}
export async function lockGroups(tx: Tx, ids: number[]) {
  for (const id of [...new Set(ids)].sort((a,b) => a-b)) await lockOpenGroup(tx, id);
}
export async function invalidatePrimary(tx: Tx, kind: PrimaryKind, id: number, actorId: number, reason: string, expected?: number) {
  const current = await primary(tx, kind, id);
  await lockOpenGroup(tx, current.schedule.schedule_group_id);
  if (expected !== undefined) assertVersion(current, expected);
  const data = { version: { increment: 1 }, is_verified: false, verified_by_id: null, verified_at: null };
  const after = kind === "DV" ? await tx.disbursementVoucher.update({ where: { id }, data }) : await tx.acknowledgementReceipt.update({ where: { id }, data });
  if (current.is_verified) await tx.verificationEvent.create({ data: { dv_id: kind === "DV" ? id : null, ar_id: kind === "AR" ? id : null, user_id: actorId, event: "CLEARED_BY_EDIT", reason } });
  await auditMutation(tx, actorId, kind, id, reason, current, after);
  return after;
}
