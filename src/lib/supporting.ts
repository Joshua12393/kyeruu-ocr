import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "./prisma";
import { requireFinanceAccess, requireTransactionEditor, type AuthenticatedUser } from "./auth";
import { apiError, ApiError, assertScheduleDirection } from "./api";
import { assertAvailableScan } from "./transactions";
import { financeMutation, assertVersion, primary, invalidatePrimary, auditMutation, validateTermDate, lockGroups, type Tx, type PrimaryKind } from "./mutations";
import { supportingInput, itemGross, type SupportingInput } from "./supporting-validation";
import { positiveId } from "./validation";
export async function supportDocument(tx: Tx, kind: "RECEIPT" | "SHEET", id: number) {
  const document = kind === "RECEIPT" ? await tx.receipt.findUnique({ where: { id }, include: { particulars: { include: { schedule: { include: { group: true } } } }, scan_file: true } }) : await tx.aRSupportingDocument.findUnique({ where: { id }, include: { ar_sheet_links: { include: { acknowledgement_receipt: { include: { schedule: { include: { group: true } } } } } }, scan_file: true } });
  if (!document) throw new ApiError(404, "Supporting document not found.");
  return document;
}
export async function saveSupporting(tx: Tx, user: AuthenticatedUser, input: SupportingInput, id?: number) {
  const before = id ? await supportDocument(tx, input.kind, id) : null;
  if (before) {
    if (!input.version) throw new ApiError(400, "Document version is required.");
    assertVersion(before, input.version);
    if (before.academic_year !== user.term) throw new ApiError(403, "Historical or unassigned legacy support is read-only.");
  } else if (input.version) throw new ApiError(400, "New documents do not have a saved version.");
  const affected = new Map<string, { kind: PrimaryKind; id: number; version?: number }>();
  const groups: number[] = [];
  if (before?.scan_file.suggested_schedule_id) {
    const source = await tx.schedule.findUnique({ where: { id: before.scan_file.suggested_schedule_id } });
    if (source) groups.push(source.schedule_group_id);
  }
  const expected = new Map<string, number>();
  for (const parent of input.parent_versions || []) {
    const key = `${parent.type}:${parent.id}`;
    if (expected.has(key) && expected.get(key) !== parent.version) throw new ApiError(400, "Conflicting parent versions.");
    expected.set(key, parent.version);
  }
  const oldReceipt = before && "particulars" in before ? before : null;
  const oldSheet = before && "ar_sheet_links" in before ? before : null;
  for (const item of oldReceipt?.particulars || []) {
    groups.push(item.schedule.schedule_group_id);
    if (item.dv_id) affected.set(`DV:${item.dv_id}`, { kind: "DV", id: item.dv_id, version: expected.get(`DV:${item.dv_id}`) });
  }
  for (const link of oldSheet?.ar_sheet_links || []) {
    groups.push(link.acknowledgement_receipt.schedule.schedule_group_id);
    affected.set(`AR:${link.ar_id}`, { kind: "AR", id: link.ar_id, version: expected.get(`AR:${link.ar_id}`) });
  }
  if (input.kind === "RECEIPT") {
    await validateTermDate(tx, user.term, input.date);
    const ids = input.particulars.flatMap(item => item.id ? [item.id] : []);
    if (new Set(ids).size !== ids.length || ids.some(itemId => !oldReceipt?.particulars.some(item => item.id === itemId))) throw new ApiError(400, "Item IDs must be distinct and belong to this saved receipt.");
    for (const item of input.particulars) {
      const side = await tx.schedule.findUnique({ where: { id: item.schedule_id } });
      if (!side || side.type !== "OUTFLOW") throw new ApiError(400, "Receipt items require an outflow schedule.");
      groups.push(side.schedule_group_id);
      try { itemGross(item.quantity, item.unit_cost); } catch (error) { throw new ApiError(400, (error as Error).message); }
      if (item.link) {
        const voucher = await primary(tx, "DV", item.link.transaction_id);
        if (voucher.schedule_id !== side.id) throw new ApiError(400, "Item and voucher must use the same schedule. Unlink before reassignment.");
        const key = `DV:${voucher.id}`;
        if (expected.has(key) && expected.get(key) !== item.link.version) throw new ApiError(400, "Conflicting voucher versions.");
        expected.set(key, item.link.version); affected.set(key, { kind: "DV", id: voucher.id, version: item.link.version });
      }
    }
  } else {
    if (new Set(input.links.map(link => link.transaction_id)).size !== input.links.length) throw new ApiError(400, "Each AR may appear only once per sheet.");
    if (input.links.reduce((sum, link) => sum.plus(link.amount_covered), new Prisma.Decimal(0)).greaterThan(input.total_amount)) throw new ApiError(400, "Allocations exceed the sheet total.");
    for (const link of input.links) {
      const receipt = await primary(tx, "AR", link.transaction_id);
      groups.push(receipt.schedule.schedule_group_id);
      if (expected.has(`AR:${receipt.id}`) && expected.get(`AR:${receipt.id}`) !== link.version) throw new ApiError(400, "Conflicting receipt versions.");
      expected.set(`AR:${receipt.id}`, link.version);
      affected.set(`AR:${receipt.id}`, { kind: "AR", id: receipt.id, version: link.version });
    }
  }
  await lockGroups(tx, groups);
  if (input.kind === "RECEIPT") for (const item of input.particulars) await assertScheduleDirection(tx, item.schedule_id, "OUTFLOW");
  if (!before || input.scan_id !== before.scan_file_id) await assertAvailableScan(tx, input.scan_id, user.id);
  for (const [key, parent] of affected) {
    const version = expected.get(key) ?? parent.version;
    if (!version) throw new ApiError(400, "Provide the current version of every affected transaction, including removed links.");
    await invalidatePrimary(tx, parent.kind, parent.id, user.id, "SUPPORT_CHANGED", version);
  }
  let after;
  if (input.kind === "RECEIPT") {
    const data = { internal_receipt_number: input.internal_receipt_number, reference_number: input.reference_number, date: new Date(`${input.date}T00:00:00Z`), doc_type: input.doc_type, scan_file_id: input.scan_id, academic_year: user.term };
    const receipt = before ? await tx.receipt.update({ where: { id: before.id }, data: { ...data, version: { increment: 1 } } }) : await tx.receipt.create({ data });
    await tx.receiptParticular.deleteMany({ where: { receipt_id: receipt.id, id: { notIn: input.particulars.flatMap(item => item.id ? [item.id] : []) } } });
    for (const item of input.particulars) {
      const data = { receipt_id: receipt.id, particular_name: item.particular_name, quantity: item.quantity, unit_cost: item.unit_cost, gross_amount: itemGross(item.quantity, item.unit_cost), schedule_id: item.schedule_id, dv_id: item.link?.transaction_id || null };
      if (item.id) await tx.receiptParticular.update({ where: { id: item.id }, data }); else await tx.receiptParticular.create({ data });
    }
    after = await supportDocument(tx, "RECEIPT", receipt.id);
  } else {
    const data = { doc_type: input.doc_type, context_label: input.context_label, period_covered: input.period_covered || null, total_amount: input.total_amount, scan_file_id: input.scan_id, academic_year: user.term };
    const sheet = before ? await tx.aRSupportingDocument.update({ where: { id: before.id }, data: { ...data, version: { increment: 1 } } }) : await tx.aRSupportingDocument.create({ data });
    await tx.aRSheetLink.deleteMany({ where: { ar_supporting_document_id: sheet.id, ar_id: { notIn: input.links.map(link => link.transaction_id) } } });
    for (const link of input.links) await tx.aRSheetLink.upsert({ where: { ar_supporting_document_id_ar_id: { ar_supporting_document_id: sheet.id, ar_id: link.transaction_id } }, create: { ar_supporting_document_id: sheet.id, ar_id: link.transaction_id, amount_covered: link.amount_covered }, update: { amount_covered: link.amount_covered } });
    after = await supportDocument(tx, "SHEET", sheet.id);
  }
  await tx.documentScan.update({ where: { id: input.scan_id }, data: { reviewed_values: JSON.parse(JSON.stringify(input)) } });
  await auditMutation(tx, user.id, input.kind, after.id, before ? "EDIT_SUPPORT" : "CREATE_SUPPORT", before, after);
  return after;
}
export async function listSupporting(req: Request) {
  try {
    const guard = await requireFinanceAccess(req); if (guard instanceof NextResponse) return guard;
    const [receipts, sheets] = await Promise.all([
      prisma.receipt.findMany({ include: { particulars: { include: { schedule: { include: { group: true } }, voucher: { select: { id: true, control_number: true, version: true, deleted_at: true } } } }, scan_file: true }, orderBy: { id: "desc" } }),
      prisma.aRSupportingDocument.findMany({ include: { ar_sheet_links: { include: { acknowledgement_receipt: { include: { schedule: { include: { group: true } } } } } }, scan_file: true }, orderBy: { id: "desc" } }),
    ]);
    const closedSources = await prisma.schedule.findMany({ where: { group: { is_closed: true } }, select: { id: true } });
    const frozen = new Set(closedSources.map(side => side.id));
    const mark = <T extends { scan_file: { suggested_schedule_id: number | null } }>(document: T) => ({ ...document, source_read_only: !!document.scan_file.suggested_schedule_id && frozen.has(document.scan_file.suggested_schedule_id) });
    return NextResponse.json({ receipts: receipts.map(mark), sheets: sheets.map(mark) });
  } catch (error) { return apiError(error); }
}
export async function writeSupporting(req: Request, id?: number) {
  try {
    const guard = await requireTransactionEditor(req); if (guard instanceof NextResponse) return guard;
    const input = supportingInput.parse(await req.json());
    const document = await financeMutation(guard.user, tx => saveSupporting(tx, guard.user, input, id));
    return NextResponse.json(document, { status: id ? 200 : 201 });
  } catch (error) { return apiError(error); }
}
export async function patchSupporting(req: Request, context: { params: Promise<{ id: string }> }) {
  try { return await writeSupporting(req, positiveId.parse((await context.params).id)); } catch (error) { return apiError(error); }
}
