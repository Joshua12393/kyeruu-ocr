import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireFinanceAccess, requireTransactionEditor, requireTreasurer } from "@/lib/auth";
import { apiError, ApiError, lockOpenGroup, assertScheduleDirection } from "@/lib/api";
import { positiveId, receiptInput, voucherInput } from "@/lib/validation";
import { Prisma } from "@prisma/client";
import { z } from "zod";

type Kind = "DV" | "AR";
const include = { schedule: { include: { group: true } }, scan_file: true };

export async function listTransactions(req: Request, kind: Kind) {
  try {
    const guard = await requireFinanceAccess(req);
    if (guard instanceof NextResponse) return guard;
    const records = kind === "DV"
      ? await prisma.disbursementVoucher.findMany({ include: { ...include, released_to: { select: { id: true, name: true } } }, orderBy: { created_at: "desc" } })
      : await prisma.acknowledgementReceipt.findMany({ include: { ...include, remitted_by: { select: { id: true, name: true } } }, orderBy: { created_at: "desc" } });
    return NextResponse.json(records);
  } catch (error) { return apiError(error); }
}

export async function createTransaction(req: Request, kind: Kind) {
  try {
    const guard = await requireTransactionEditor(req);
    if (guard instanceof NextResponse) return guard;
    const raw = await req.json();
    const input = kind === "DV" ? voucherInput.parse(raw) : receiptInput.parse(raw);
    const result = await prisma.$transaction(async tx => {
      const schedule = await tx.schedule.findUnique({ where: { id: input.schedule_id } });
      if (!schedule || schedule.type !== (kind === "DV" ? "OUTFLOW" : "INFLOW")) throw new ApiError(400, "Invalid schedule direction.");
      await lockOpenGroup(tx, schedule.schedule_group_id);
      await assertScheduleDirection(tx, schedule.id, kind === "DV" ? "OUTFLOW" : "INFLOW");
      if (input.scan_file_id) await assertAvailableScan(tx, input.scan_file_id, guard.user.id);
      const data = { ...input, date: new Date(`${input.date}T00:00:00Z`) };
      return kind === "DV"
        ? tx.disbursementVoucher.create({ data: { ...data, released_to_id: voucherInput.parse(raw).released_to_id } })
        : tx.acknowledgementReceipt.create({ data: { ...data, remitted_by_id: receiptInput.parse(raw).remitted_by_id } });
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function assertAvailableScan(tx: Prisma.TransactionClient, scanId: number, userId: number) {
  await tx.$queryRaw`SELECT id FROM document_scans WHERE id = ${scanId} FOR UPDATE`;
  const scan = await tx.documentScan.findUnique({ where: { id: scanId }, include: { _count: { select: { disbursement_vouchers: true, acknowledgement_receipts: true, receipts: true, ar_supporting_documents: true } } } });
  if (!scan) throw new ApiError(404, "Scan not found.");
  if (scan.uploaded_by_id !== userId) throw new ApiError(403, "Only the uploader can assign this scan.");
  if (Object.values(scan._count).some(count => count > 0)) throw new ApiError(409, "This scan is already assigned.");
}

export async function editTransaction(req: Request, kind: Kind, id: number) {
  try {
    const guard = await requireTransactionEditor(req);
    if (guard instanceof NextResponse) return guard;
    const raw = await req.json();
    const version = positiveId.parse(raw.version);
    const input = kind === "DV" ? voucherInput.parse(raw) : receiptInput.parse(raw);
    const result = await prisma.$transaction(async tx => {
      const current = kind === "DV" ? await tx.disbursementVoucher.findUnique({ where: { id }, include: { schedule: true } }) : await tx.acknowledgementReceipt.findUnique({ where: { id }, include: { schedule: true } });
      if (!current) throw new ApiError(404, "Transaction not found.");
      const schedule = await tx.schedule.findUnique({ where: { id: input.schedule_id } });
      if (!schedule || schedule.type !== (kind === "DV" ? "OUTFLOW" : "INFLOW")) throw new ApiError(400, "Invalid schedule direction.");
      for (const groupId of [...new Set([current.schedule.schedule_group_id, schedule.schedule_group_id])].sort((a,b) => a-b)) await lockOpenGroup(tx, groupId);
      await assertScheduleDirection(tx, schedule.id, kind === "DV" ? "OUTFLOW" : "INFLOW");
      if (kind === "DV" && schedule.id !== current.schedule_id && await tx.receiptParticular.count({ where: { dv_id: id } })) {
        throw new ApiError(409, "A voucher with linked receipt items cannot move to another schedule.");
      }
      if (input.scan_file_id && input.scan_file_id !== current.scan_file_id) await assertAvailableScan(tx, input.scan_file_id, guard.user.id);
      const data = { ...input, date: new Date(`${input.date}T00:00:00Z`), version: { increment: 1 }, is_verified: false, verified_by_id: null, verified_at: null };
      const updated = kind === "DV"
        ? await tx.disbursementVoucher.updateMany({ where: { id, version }, data: { ...data, released_to_id: voucherInput.parse(raw).released_to_id } })
        : await tx.acknowledgementReceipt.updateMany({ where: { id, version }, data: { ...data, remitted_by_id: receiptInput.parse(raw).remitted_by_id } });
      if (!updated.count) throw new ApiError(409, "This record changed. Refresh before saving.");
      if (current.is_verified) await tx.verificationEvent.create({ data: { dv_id: kind === "DV" ? id : null, ar_id: kind === "AR" ? id : null, event: "CLEARED_BY_EDIT", user_id: guard.user.id } });
      return kind === "DV" ? tx.disbursementVoucher.findUnique({ where: { id } }) : tx.acknowledgementReceipt.findUnique({ where: { id } });
    });
    return NextResponse.json(result);
  } catch (error) { return apiError(error); }
}

export async function deleteTransaction(req: Request, kind: Kind, id: number) {
  try {
    const guard = await requireTreasurer(req);
    if (guard instanceof NextResponse) return guard;
    const { version } = z.object({ version: positiveId }).parse(await req.json());
    await prisma.$transaction(async tx => {
      const current = kind === "DV" ? await tx.disbursementVoucher.findUnique({ where: { id }, include: { schedule: true } }) : await tx.acknowledgementReceipt.findUnique({ where: { id }, include: { schedule: true } });
      if (!current) throw new ApiError(404, "Transaction not found.");
      await lockOpenGroup(tx, current.schedule.schedule_group_id);
      if (current.version !== version) throw new ApiError(409, "This record changed. Refresh before deleting.");
      const events = await tx.verificationEvent.count({ where: kind === "DV" ? { dv_id: id } : { ar_id: id } });
      if (events) throw new ApiError(409, "Transactions with audit history cannot be deleted.");
      if (kind === "DV") { await tx.receiptParticular.updateMany({ where: { dv_id: id }, data: { dv_id: null } }); await tx.disbursementVoucher.delete({ where: { id, version } }); }
      else { await tx.aRSheetLink.deleteMany({ where: { ar_id: id } }); await tx.acknowledgementReceipt.delete({ where: { id, version } }); }
    });
    return NextResponse.json({ message: "Transaction deleted." });
  } catch (error) { return apiError(error); }
}
