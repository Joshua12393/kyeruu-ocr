import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTransactionEditor } from "@/lib/auth";
import { apiError, ApiError, lockOpenGroup } from "@/lib/api";
import { assertAvailableScan } from "@/lib/transactions";
import { positiveId } from "@/lib/validation";
import { z } from "zod";

export async function linkDocument(req: Request) {
  try {
    const guard = await requireTransactionEditor(req);
    if (guard instanceof NextResponse) return guard;
    const input = z.object({ scan_id: positiveId, transaction_type: z.enum(["DV", "AR"]), transaction_id: positiveId, version: positiveId }).parse(await req.json());
    await prisma.$transaction(async tx => {
      const id = input.transaction_id;
      const current = input.transaction_type === "DV" ? await tx.disbursementVoucher.findUnique({ where: { id }, include: { schedule: true } }) : await tx.acknowledgementReceipt.findUnique({ where: { id }, include: { schedule: true } });
      if (!current) throw new ApiError(404, "Transaction not found.");
      await lockOpenGroup(tx, current.schedule.schedule_group_id);
      await assertAvailableScan(tx, input.scan_id, guard.user.id);
      const data = { scan_file_id: input.scan_id, is_verified: false, verified_by_id: null, verified_at: null, version: { increment: 1 } };
      const changed = input.transaction_type === "DV" ? await tx.disbursementVoucher.updateMany({ where: { id, version: input.version }, data }) : await tx.acknowledgementReceipt.updateMany({ where: { id, version: input.version }, data });
      if (!changed.count) throw new ApiError(409, "This record changed. Refresh before linking.");
      if (current.is_verified) await tx.verificationEvent.create({ data: { dv_id: input.transaction_type === "DV" ? id : null, ar_id: input.transaction_type === "AR" ? id : null, event: "CLEARED_BY_EDIT", user_id: guard.user.id } });
    });
    return NextResponse.json({ message: "Document linked successfully." });
  } catch (error) { return apiError(error); }
}
