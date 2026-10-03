import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireTransactionEditor } from "@/lib/auth";
import { apiError, ApiError, lockOpenGroup } from "@/lib/api";
import { money, positiveId } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    const guard = await requireTransactionEditor(req);
    if (guard instanceof NextResponse) return guard;
    const input = z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("PARTICULAR"), document_id: positiveId, transaction_id: positiveId, version: positiveId }),
      z.object({ kind: z.literal("SHEET"), document_id: positiveId, transaction_id: positiveId, version: positiveId, amount_covered: money }),
    ]).parse(await req.json());
    await prisma.$transaction(async tx => {
      const id = input.transaction_id;
      const current = input.kind === "PARTICULAR" ? await tx.disbursementVoucher.findUnique({ where: { id }, include: { schedule: true } }) : await tx.acknowledgementReceipt.findUnique({ where: { id }, include: { schedule: true } });
      if (!current) throw new ApiError(404, "Transaction not found.");
      await lockOpenGroup(tx, current.schedule.schedule_group_id);
      if (input.kind === "PARTICULAR") {
        await tx.$queryRaw`SELECT id FROM receipt_particulars WHERE id = ${input.document_id} FOR UPDATE`;
        const item = await tx.receiptParticular.findUnique({ where: { id: input.document_id } });
        if (!item) throw new ApiError(404, "Receipt item not found.");
        if (item.dv_id) throw new ApiError(409, "Receipt item is already linked.");
        if (item.schedule_id !== current.schedule_id) throw new ApiError(400, "Receipt item and voucher must use the same schedule.");
        await tx.receiptParticular.update({ where: { id: item.id }, data: { dv_id: id } });
      } else {
        await tx.$queryRaw`SELECT id FROM ar_supporting_documents WHERE id = ${input.document_id} FOR UPDATE`;
        // Locking read prevents two officers allocating the remaining amount twice.
        const documents = await tx.$queryRaw<{ total_amount: string }[]>`SELECT total_amount FROM ar_supporting_documents WHERE id = ${input.document_id} FOR UPDATE`;
        if (!documents.length) throw new ApiError(404, "Sheet not found.");
        const allocations = await tx.$queryRaw<{ ar_id: number; amount_covered: string }[]>`SELECT ar_id, amount_covered FROM ar_sheet_links WHERE ar_supporting_document_id = ${input.document_id} FOR UPDATE`;
        if (allocations.some(link => link.ar_id === id)) throw new ApiError(409, "This sheet is already linked to that receipt.");
        const total = allocations.reduce((sum, link) => sum.plus(link.amount_covered), new Prisma.Decimal(input.amount_covered));
        if (total.greaterThan(documents[0].total_amount)) throw new ApiError(400, "Allocations exceed the sheet total.");
        await tx.aRSheetLink.create({ data: { ar_supporting_document_id: input.document_id, ar_id: id, amount_covered: input.amount_covered } });
      }
      const data = { version: { increment: 1 }, is_verified: false, verified_by_id: null, verified_at: null };
      const changed = input.kind === "PARTICULAR" ? await tx.disbursementVoucher.updateMany({ where: { id, version: input.version }, data }) : await tx.acknowledgementReceipt.updateMany({ where: { id, version: input.version }, data });
      if (!changed.count) throw new ApiError(409, "Transaction changed. Refresh before linking.");
      if (current.is_verified) await tx.verificationEvent.create({ data: { dv_id: input.kind === "PARTICULAR" ? id : null, ar_id: input.kind === "SHEET" ? id : null, event: "CLEARED_BY_EDIT", user_id: guard.user.id } });
    });
    return NextResponse.json({ message: "Supporting document linked." });
  } catch (error) { return apiError(error); }
}
