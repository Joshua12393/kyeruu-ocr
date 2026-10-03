import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuditor, requireFinanceAccess } from "@/lib/auth";
import { apiError, ApiError, lockOpenGroup } from "@/lib/api";
import { positiveId } from "@/lib/validation";
import { z } from "zod";

export async function listVerification(req: Request) {
  try {
    const guard = await requireFinanceAccess(req);
    if (guard instanceof NextResponse) return guard;
    const [vouchers, receipts] = await Promise.all([
      prisma.disbursementVoucher.findMany({ include: { released_to: { select: { id: true, name: true } }, schedule: true, scan_file: true }, orderBy: { created_at: "desc" } }),
      prisma.acknowledgementReceipt.findMany({ include: { remitted_by: { select: { id: true, name: true } }, schedule: true, scan_file: true }, orderBy: { created_at: "desc" } }),
    ]);
    return NextResponse.json({ vouchers, receipts });
  } catch (error) { return apiError(error); }
}

export async function toggleVerification(req: Request) {
  try {
    const guard = await requireAuditor(req);
    if (guard instanceof NextResponse) return guard;
    const input = z.object({ transaction_id: positiveId, type: z.enum(["DV", "AR"]), status: z.boolean(), version: positiveId }).parse(await req.json());
    const result = await prisma.$transaction(async tx => {
      const id = input.transaction_id;
      const current = input.type === "DV" ? await tx.disbursementVoucher.findUnique({ where: { id }, include: { schedule: true } }) : await tx.acknowledgementReceipt.findUnique({ where: { id }, include: { schedule: true } });
      if (!current) throw new ApiError(404, "Transaction not found.");
      await lockOpenGroup(tx, current.schedule.schedule_group_id);
      const data = { is_verified: input.status, verified_at: input.status ? new Date() : null, verified_by_id: input.status ? guard.user.id : null, version: { increment: 1 } };
      const changed = input.type === "DV" ? await tx.disbursementVoucher.updateMany({ where: { id, version: input.version }, data }) : await tx.acknowledgementReceipt.updateMany({ where: { id, version: input.version }, data });
      if (!changed.count) throw new ApiError(409, "This record changed. Refresh before verifying.");
      await tx.verificationEvent.create({ data: { dv_id: input.type === "DV" ? id : null, ar_id: input.type === "AR" ? id : null, event: input.status ? "VERIFIED" : "UNVERIFIED", user_id: guard.user.id } });
      return input.type === "DV" ? tx.disbursementVoucher.findUnique({ where: { id } }) : tx.acknowledgementReceipt.findUnique({ where: { id } });
    });
    return NextResponse.json(result);
  } catch (error) { return apiError(error); }
}
