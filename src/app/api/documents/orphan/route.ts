import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireFinanceAccess } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { Prisma } from "@prisma/client";
export async function GET(req: Request) {
  try {
    const guard = await requireFinanceAccess(req);
    if (guard instanceof NextResponse) return guard;
    const [scans, items, sheets] = await Promise.all([
      prisma.documentScan.findMany({ where: { disbursement_vouchers: { none: {} }, acknowledgement_receipts: { none: {} }, receipts: { none: {} }, ar_supporting_documents: { none: {} } }, orderBy: { uploaded_at: "desc" } }),
      prisma.receiptParticular.findMany({ where: { dv_id: null }, include: { receipt: { include: { scan_file: true } } } }),
      prisma.aRSupportingDocument.findMany({ include: { scan_file: true, ar_sheet_links: true } }),
    ]);
    return NextResponse.json([
      ...scans.map(scan => ({ ...scan, kind: "SCAN", scan_id: scan.id })),
      ...items.map(item => ({ id: item.id, kind: "PARTICULAR", scan_id: item.receipt.scan_file_id, file_path: item.particular_name, uploaded_at: item.receipt.scan_file.uploaded_at })),
      ...sheets.filter(sheet => sheet.ar_sheet_links.reduce((sum, link) => sum.plus(link.amount_covered), new Prisma.Decimal(0)).lessThan(sheet.total_amount)).map(sheet => ({ id: sheet.id, kind: "SHEET", scan_id: sheet.scan_file_id, file_path: sheet.context_label, uploaded_at: sheet.scan_file.uploaded_at })),
    ]);
  } catch (error) { return apiError(error); }
}
export { linkDocument as POST } from "@/lib/document-links";
