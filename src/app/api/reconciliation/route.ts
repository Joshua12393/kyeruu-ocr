import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireFinanceAccess } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { Prisma } from "@prisma/client";
export async function GET(req: Request) {
  try {
    const guard = await requireFinanceAccess(req);
    if (guard instanceof NextResponse) return guard;
    const [vouchers, receipts] = await Promise.all([
      prisma.disbursementVoucher.findMany({ include: { receipt_particulars: true } }),
      prisma.acknowledgementReceipt.findMany({ include: { ar_sheet_links: true } }),
    ]);
    const incompleteDVs = vouchers.filter(v => !v.receipt_particulars.length).map(v => ({ id: v.id, control_number: v.control_number, type: "DV" }));
    const incompleteARs = receipts.filter(r => !r.ar_sheet_links.length).map(r => ({ id: r.id, control_number: r.control_number, type: "AR" }));
    const dvMismatches = vouchers.filter(v => v.receipt_particulars.length && !v.receipt_particulars.reduce((sum, item) => sum.plus(item.gross_amount), new Prisma.Decimal(0)).equals(v.amount));
    const arMismatches = receipts.filter(r => r.ar_sheet_links.length && !r.ar_sheet_links.reduce((sum, link) => sum.plus(link.amount_covered), new Prisma.Decimal(0)).equals(r.amount));
    return NextResponse.json({ incomplete: { vouchers: incompleteDVs, receipts: incompleteARs }, mismatches: { vouchers: dvMismatches, receipts: arMismatches }, summary: { total_incomplete: incompleteDVs.length + incompleteARs.length, total_mismatches: dvMismatches.length + arMismatches.length } });
  } catch (error) { return apiError(error); }
}
