import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuditor, requireFinanceAccess } from "@/lib/auth";
import { apiError, lockOpenGroup } from "@/lib/api";
import { positiveId } from "@/lib/validation";
import { financeMutation, primary, assertVersion, auditMutation } from "./mutations";
import { z } from "zod";

export async function listVerification(req: Request) {
  try {
    const guard = await requireFinanceAccess(req);
    if (guard instanceof NextResponse) return guard;
    const [vouchers, receipts] = await Promise.all([
      prisma.disbursementVoucher.findMany({ where: { deleted_at: null }, include: { released_to: { select: { id: true, name: true } }, schedule: { include: { group: true } }, scan_file: true }, orderBy: { created_at: "desc" } }),
      prisma.acknowledgementReceipt.findMany({ where: { deleted_at: null }, include: { remitted_by: { select: { id: true, name: true } }, schedule: { include: { group: true } }, scan_file: true }, orderBy: { created_at: "desc" } }),
    ]);
    return NextResponse.json({ vouchers, receipts });
  } catch (error) { return apiError(error); }
}

export async function toggleVerification(req: Request) {
  try {
    const guard = await requireAuditor(req);
    if (guard instanceof NextResponse) return guard;
    const input = z.object({ transaction_id: positiveId, type: z.enum(["DV", "AR"]), status: z.boolean(), version: positiveId }).parse(await req.json());
    const result = await financeMutation(guard.user, async tx => {
      const id = input.transaction_id;
      const current = await primary(tx, input.type, id);
      await lockOpenGroup(tx, current.schedule.schedule_group_id);
      assertVersion(current, input.version);
      const data = { is_verified: input.status, verified_at: input.status ? new Date() : null, verified_by_id: input.status ? guard.user.id : null, version: { increment: 1 } };
      const after = input.type === "DV" ? await tx.disbursementVoucher.update({ where: { id }, data }) : await tx.acknowledgementReceipt.update({ where: { id }, data });
      await tx.verificationEvent.create({ data: { dv_id: input.type === "DV" ? id : null, ar_id: input.type === "AR" ? id : null, event: input.status ? "VERIFIED" : "UNVERIFIED", user_id: guard.user.id } });
      await auditMutation(tx, guard.user.id, input.type, id, input.status ? "VERIFIED" : "UNVERIFIED", current, after);
      return after;
    });
    return NextResponse.json(result);
  } catch (error) { return apiError(error); }
}
