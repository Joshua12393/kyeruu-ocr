import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireFinanceAccess, requireTransactionEditor, requireTreasurer } from "@/lib/auth";
import { apiError, ApiError, assertScheduleDirection } from "@/lib/api";
import { positiveId, receiptInput, voucherInput, transactionInput } from "@/lib/validation";
import { financeMutation, primary, assertVersion, invalidatePrimary, auditMutation, validateTermDate, lockGroups, type Tx, type PrimaryKind } from "./mutations";
import { z } from "zod";
const include = { schedule: { include: { group: true } }, scan_file: true };
export async function listTransactions(req: Request, kind: PrimaryKind) {
  try {
    const guard = await requireFinanceAccess(req); if (guard instanceof NextResponse) return guard;
    return NextResponse.json(kind === "DV"
      ? await prisma.disbursementVoucher.findMany({ where: { deleted_at: null }, include: { ...include, released_to: { select: { id: true, name: true } } }, orderBy: { created_at: "desc" } })
      : await prisma.acknowledgementReceipt.findMany({ where: { deleted_at: null }, include: { ...include, remitted_by: { select: { id: true, name: true } } }, orderBy: { created_at: "desc" } }));
  } catch (error) { return apiError(error); }
}
async function reserveNumber(tx: Tx, kind: PrimaryKind, number: string, targetId: number) {
  const reservation = await tx.controlNumberReservation.findUnique({ where: { kind_number: { kind, number } } });
  if (reservation && reservation.target_id !== targetId) throw new ApiError(409, "This control number is already reserved, including deleted or renumbered records.", { field: "control_number" });
  if (!reservation) await tx.controlNumberReservation.create({ data: { kind, number, target_id: targetId } });
}
export async function createTransaction(req: Request, kind: PrimaryKind) {
  try {
    const guard = await requireTransactionEditor(req); if (guard instanceof NextResponse) return guard;
    const raw = await req.json();
    const input = kind === "DV" ? voucherInput.parse(raw) : receiptInput.parse(raw);
    const result = await financeMutation(guard.user, async tx => {
      const schedule = await tx.schedule.findUnique({ where: { id: input.schedule_id } });
      if (!schedule || schedule.type !== (kind === "DV" ? "OUTFLOW" : "INFLOW")) throw new ApiError(400, "Invalid schedule direction.");
      await lockGroups(tx, [schedule.schedule_group_id]);
      await assertScheduleDirection(tx, schedule.id, kind === "DV" ? "OUTFLOW" : "INFLOW");
      await validateTermDate(tx, guard.user.term, input.date);
      if (input.scan_file_id) await assertAvailableScan(tx, input.scan_file_id, guard.user.id);
      const data = { ...input, date: new Date(`${input.date}T00:00:00Z`) };
      const created = kind === "DV" ? await tx.disbursementVoucher.create({ data: { ...data, released_to_id: voucherInput.parse(raw).released_to_id } }) : await tx.acknowledgementReceipt.create({ data: { ...data, remitted_by_id: receiptInput.parse(raw).remitted_by_id } });
      if (created.scan_file_id) await tx.documentScan.update({ where: { id: created.scan_file_id }, data: { reviewed_values: JSON.parse(JSON.stringify(input)) } });
      await reserveNumber(tx, kind, created.control_number, created.id);
      await auditMutation(tx, guard.user.id, kind, created.id, "CREATE", null, created);
      return created;
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return apiError(error); }
}
export async function assertAvailableScan(tx: Tx, scanId: number, userId: number) {
  await tx.$queryRaw`SELECT id FROM document_scans WHERE id = ${scanId} FOR UPDATE`;
  const scan = await tx.documentScan.findUnique({ where: { id: scanId }, include: { _count: { select: { disbursement_vouchers: { where: { deleted_at: null } }, acknowledgement_receipts: { where: { deleted_at: null } }, receipts: true, ar_supporting_documents: true } } } });
  if (!scan) throw new ApiError(404, "Scan not found.");
  if (scan.suggested_schedule_id) {
    const source = await tx.schedule.findUnique({ where: { id: scan.suggested_schedule_id } });
    if (source) await lockGroups(tx, [source.schedule_group_id]);
  }
  // Unassigned legacy scans can be claimed only when their upload date fits the
  // current configured term. Existing historical document ownership is immutable.
  const settings = await tx.omsSettings.findUnique({ where: { id: 1 } });
  const term = settings?.current_term || process.env.FINANCE_CURRENT_TERM!;
  if (Object.values(scan._count).some(count => count > 0)) throw new ApiError(409, "This scan is already assigned.");
  if (scan.academic_year && scan.academic_year !== term) throw new ApiError(403, "Historical scans cannot be reassigned to a current-term record.");
  if (!scan.academic_year) {
    await validateTermDate(tx, term, scan.uploaded_at.toISOString().slice(0,10));
    await tx.documentScan.update({ where: { id: scanId }, data: { academic_year: term } });
  }
  if (!Number.isSafeInteger(userId)) throw new ApiError(401, "Officer identity is required.");
}
export async function editTransaction(req: Request, kind: PrimaryKind, id: number) {
  try {
    const guard = await requireTransactionEditor(req); if (guard instanceof NextResponse) return guard;
    const raw = await req.json(); const version = positiveId.parse(raw.version);
    // An unchanged legacy control number remains editable; new/changed numbers
    // must pass the accepted format. Existing values are never rewritten by a migration.
    const legacyControl = z.string().trim().min(1).max(50);
    const input = kind === "DV" ? voucherInput.extend({ control_number: legacyControl }).parse(raw) : receiptInput.extend({ control_number: legacyControl }).parse(raw);
    const result = await financeMutation(guard.user, async tx => {
      const current = await primary(tx, kind, id); assertVersion(current, version);
      if (input.control_number !== current.control_number) transactionInput.shape.control_number.parse(input.control_number);
      const schedule = await tx.schedule.findUnique({ where: { id: input.schedule_id } });
      if (!schedule || schedule.type !== (kind === "DV" ? "OUTFLOW" : "INFLOW")) throw new ApiError(400, "Invalid schedule direction.");
      await lockGroups(tx, [current.schedule.schedule_group_id, schedule.schedule_group_id]);
      await assertScheduleDirection(tx, schedule.id, kind === "DV" ? "OUTFLOW" : "INFLOW");
      await validateTermDate(tx, guard.user.term, input.date);
      if (kind === "DV" && schedule.id !== current.schedule_id && await tx.receiptParticular.count({ where: { dv_id: id } })) throw new ApiError(409, "Unlink or reassign supporting items before moving this voucher.");
      if (input.scan_file_id && input.scan_file_id !== current.scan_file_id) await assertAvailableScan(tx, input.scan_file_id, guard.user.id);
      await reserveNumber(tx, kind, input.control_number, id);
      await invalidatePrimary(tx, kind, id, guard.user.id, "TRANSACTION_EDIT", version);
      const data = { ...input, date: new Date(`${input.date}T00:00:00Z`) };
      const after = kind === "DV" ? await tx.disbursementVoucher.update({ where: { id }, data: { ...data, released_to_id: Number(raw.released_to_id) } }) : await tx.acknowledgementReceipt.update({ where: { id }, data: { ...data, remitted_by_id: Number(raw.remitted_by_id) } });
      if (after.scan_file_id) await tx.documentScan.update({ where: { id: after.scan_file_id }, data: { reviewed_values: JSON.parse(JSON.stringify(input)) } });
      await auditMutation(tx, guard.user.id, kind, id, "EDIT", current, after);
      return after;
    });
    return NextResponse.json(result);
  } catch (error) { return apiError(error); }
}
export async function deleteTransaction(req: Request, kind: PrimaryKind, id: number) {
  try {
    const guard = await requireTreasurer(req); if (guard instanceof NextResponse) return guard;
    const { version } = z.object({ version: positiveId }).parse(await req.json());
    await financeMutation(guard.user, async tx => {
      const current = await primary(tx, kind, id); assertVersion(current, version);
      await lockGroups(tx, [current.schedule.schedule_group_id]);
      await invalidatePrimary(tx, kind, id, guard.user.id, "TRANSACTION_DELETED", version);
      if (kind === "DV") {
        const items = await tx.receiptParticular.findMany({ where: { dv_id: id } });
        for (const receiptId of [...new Set(items.map(item => item.receipt_id))]) {
          const before = await tx.receipt.findUniqueOrThrow({ where: { id: receiptId }, include: { particulars: true } });
          await lockGroups(tx, (await tx.schedule.findMany({ where: { id: { in: before.particulars.map(item => item.schedule_id) } } })).map(side => side.schedule_group_id));
          for (const parentId of [...new Set(before.particulars.flatMap(item => item.dv_id && item.dv_id !== id ? [item.dv_id] : []))]) await invalidatePrimary(tx, "DV", parentId, guard.user.id, "SHARED_SUPPORT_UNLINKED");
          await tx.receiptParticular.updateMany({ where: { receipt_id: receiptId, dv_id: id }, data: { dv_id: null } });
          const after = await tx.receipt.update({ where: { id: receiptId }, data: { version: { increment: 1 } }, include: { particulars: true } });
          await auditMutation(tx, guard.user.id, "RECEIPT", receiptId, "VOUCHER_DELETED_UNLINK", before, after);
        }
      } else {
        const links = await tx.aRSheetLink.findMany({ where: { ar_id: id } });
        for (const sheetId of links.map(link => link.ar_supporting_document_id)) {
          const before = await tx.aRSupportingDocument.findUniqueOrThrow({ where: { id: sheetId }, include: { ar_sheet_links: { include: { acknowledgement_receipt: { include: { schedule: true } } } } } });
          await lockGroups(tx, before.ar_sheet_links.map(link => link.acknowledgement_receipt.schedule.schedule_group_id));
          for (const link of before.ar_sheet_links.filter(link => link.ar_id !== id)) await invalidatePrimary(tx, "AR", link.ar_id, guard.user.id, "SHARED_SUPPORT_UNLINKED");
          await tx.aRSheetLink.deleteMany({ where: { ar_supporting_document_id: sheetId, ar_id: id } });
          const after = await tx.aRSupportingDocument.update({ where: { id: sheetId }, data: { version: { increment: 1 } }, include: { ar_sheet_links: true } });
          await auditMutation(tx, guard.user.id, "SHEET", sheetId, "RECEIPT_DELETED_UNLINK", before, after);
        }
      }
      const data = { deleted_at: new Date(), deleted_by_id: guard.user.id };
      const after = kind === "DV" ? await tx.disbursementVoucher.update({ where: { id }, data }) : await tx.acknowledgementReceipt.update({ where: { id }, data });
      await auditMutation(tx, guard.user.id, kind, id, "DELETE", current, after);
    });
    return NextResponse.json({ message: "Transaction deleted from active records. Scans/history and its reserved control number were retained; support returned to the queue." });
  } catch (error) { return apiError(error); }
}
