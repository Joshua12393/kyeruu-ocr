import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireFinanceAccess, requireTransactionEditor } from "@/lib/auth";
import { apiError, ApiError, lockOpenGroup } from "@/lib/api";
import { money, positiveId } from "@/lib/validation";
import { assertAvailableScan } from "@/lib/transactions";

const versionedLink = { transaction_id: positiveId, version: positiveId };
const receiptSchema = z.object({
  kind: z.literal("RECEIPT"), scan_id: positiveId,
  internal_receipt_number: z.string().trim().min(1).max(50), reference_number: z.string().trim().min(1).max(100),
  date: z.iso.date(), doc_type: z.enum(["RETAILER_RECEIPT", "CERTIFICATE_OF_EXPENSES"]),
  particulars: z.array(z.object({ particular_name: z.string().trim().min(1).max(255),
    quantity: money.refine(value => new Prisma.Decimal(value).lessThan(100000000)), unit_cost: money, schedule_id: positiveId,
    link: z.object(versionedLink).optional(),
  })).min(1).max(200),
});
const sheetSchema = z.object({
  kind: z.literal("SHEET"), scan_id: positiveId, doc_type: z.enum(["COLLECTION_SHEET", "SALES_SHEET"]),
  context_label: z.string().trim().min(1).max(255), period_covered: z.string().trim().max(100).optional(), total_amount: money,
  links: z.array(z.object({ ...versionedLink, amount_covered: money })).max(200),
});

export async function GET(req: Request) {
  try {
    const guard = await requireFinanceAccess(req);
    if (guard instanceof NextResponse) return guard;
    const [receipts, sheets] = await Promise.all([
      prisma.receipt.findMany({ include: { particulars: true, scan_file: true } }),
      prisma.aRSupportingDocument.findMany({ include: { ar_sheet_links: true, scan_file: true } }),
    ]);
    return NextResponse.json({ receipts, sheets });
  } catch (error) { return apiError(error); }
}

export async function POST(req: Request) {
  try {
    const guard = await requireTransactionEditor(req);
    if (guard instanceof NextResponse) return guard;
    const input = z.discriminatedUnion("kind", [receiptSchema, sheetSchema]).parse(await req.json());
    const document = await prisma.$transaction(async tx => {
      const linked = new Map<number, number>();
      const groupIds = new Set<number>();
      if (input.kind === "RECEIPT") {
        for (const item of input.particulars) {
          const schedule = await tx.schedule.findUnique({ where: { id: item.schedule_id } });
          if (!schedule || schedule.type !== "OUTFLOW") throw new ApiError(400, "Receipt items require an outflow schedule.");
          groupIds.add(schedule.schedule_group_id);
          if (item.link) {
            const voucher = await tx.disbursementVoucher.findUnique({ where: { id: item.link.transaction_id } });
            if (!voucher || voucher.schedule_id !== schedule.id) throw new ApiError(400, "The voucher must belong to the item's schedule.");
            if (linked.has(voucher.id) && linked.get(voucher.id) !== item.link.version) throw new ApiError(409, "Conflicting voucher versions.");
            linked.set(voucher.id, item.link.version);
          }
        }
      } else {
        const sum = input.links.reduce((value, link) => value.plus(link.amount_covered), new Prisma.Decimal(0));
        if (sum.greaterThan(input.total_amount)) throw new ApiError(400, "Allocations exceed the sheet total.");
        for (const link of input.links) {
          if (linked.has(link.transaction_id)) throw new ApiError(400, "Each receipt can appear only once per sheet.");
          const receipt = await tx.acknowledgementReceipt.findUnique({ where: { id: link.transaction_id }, include: { schedule: true } });
          if (!receipt) throw new ApiError(404, "Acknowledgement receipt not found.");
          groupIds.add(receipt.schedule.schedule_group_id);
          linked.set(receipt.id, link.version);
        }
      }
      for (const groupId of [...groupIds].sort((a,b) => a-b)) await lockOpenGroup(tx, groupId);
      await assertAvailableScan(tx, input.scan_id, guard.user.id);
      for (const [id, version] of [...linked].sort((a,b) => a[0]-b[0])) {
        const current = input.kind === "RECEIPT" ? await tx.disbursementVoucher.findUnique({ where: { id } }) : await tx.acknowledgementReceipt.findUnique({ where: { id } });
        const data = { version: { increment: 1 }, is_verified: false, verified_by_id: null, verified_at: null };
        const changed = input.kind === "RECEIPT" ? await tx.disbursementVoucher.updateMany({ where: { id, version }, data }) : await tx.acknowledgementReceipt.updateMany({ where: { id, version }, data });
        if (!changed.count) throw new ApiError(409, "A transaction changed. Refresh before linking support.");
        if (current?.is_verified) await tx.verificationEvent.create({ data: { dv_id: input.kind === "RECEIPT" ? id : null, ar_id: input.kind === "SHEET" ? id : null, event: "CLEARED_BY_EDIT", user_id: guard.user.id } });
      }
      if (input.kind === "RECEIPT") {
        return tx.receipt.create({ data: {
          internal_receipt_number: input.internal_receipt_number, reference_number: input.reference_number, date: new Date(`${input.date}T00:00:00Z`), doc_type: input.doc_type, scan_file_id: input.scan_id,
          particulars: { create: input.particulars.map(item => {
            const gross = new Prisma.Decimal(item.quantity).times(item.unit_cost);
            if (gross.decimalPlaces() > 2 || gross.greaterThan("9999999999.99")) throw new ApiError(400, "Each quantity × unit cost must produce a valid two-decimal amount.");
            return { particular_name: item.particular_name, quantity: item.quantity, unit_cost: item.unit_cost, gross_amount: gross, schedule_id: item.schedule_id, dv_id: item.link?.transaction_id };
          }) },
        }, include: { particulars: true } });
      }
      return tx.aRSupportingDocument.create({ data: {
        doc_type: input.doc_type, context_label: input.context_label, period_covered: input.period_covered, total_amount: input.total_amount, scan_file_id: input.scan_id,
        ar_sheet_links: { create: input.links.map(link => ({ ar_id: link.transaction_id, amount_covered: link.amount_covered })) },
      }, include: { ar_sheet_links: true } });
    });
    return NextResponse.json(document, { status: 201 });
  } catch (error) { return apiError(error); }
}
