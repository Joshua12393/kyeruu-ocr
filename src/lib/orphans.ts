import { Prisma } from "@prisma/client";
import prisma from "./prisma";
export async function orphanDocuments(term = "all", scheduleId?: number) {
  const owner = term === "all" ? {} : { academic_year: term };
  const [scans, items, sheets] = await Promise.all([
    prisma.documentScan.findMany({ where: { ...owner, disbursement_vouchers: { none: { deleted_at: null } }, acknowledgement_receipts: { none: { deleted_at: null } }, receipts: { none: {} }, ar_supporting_documents: { none: {} } }, orderBy: { uploaded_at: "desc" } }),
    prisma.receiptParticular.findMany({ where: { dv_id: null, ...(scheduleId ? { schedule_id: scheduleId } : {}), receipt: owner }, include: { receipt: { include: { scan_file: true } }, schedule: { include: { group: true } } } }),
    prisma.aRSupportingDocument.findMany({ where: owner, include: { scan_file: true, ar_sheet_links: true } }),
  ]);
  return [
    ...scans.map(scan => ({ ...scan, kind: "SCAN" as const, scan_id: scan.id })),
    ...items.map(item => ({ id: item.id, kind: "PARTICULAR" as const, scan_id: item.receipt.scan_file_id, file_path: item.particular_name, uploaded_at: item.receipt.scan_file.uploaded_at, document_version: item.receipt.version, document_id: item.receipt_id, schedule_id: item.schedule_id, academic_year: item.receipt.academic_year, amount: item.gross_amount.toFixed(2), read_only: item.schedule.group.is_closed })),
    ...sheets.map(sheet => ({ id: sheet.id, kind: "SHEET" as const, scan_id: sheet.scan_file_id, file_path: sheet.context_label, uploaded_at: sheet.scan_file.uploaded_at, document_version: sheet.version, academic_year: sheet.academic_year, remaining: new Prisma.Decimal(sheet.total_amount).minus(sheet.ar_sheet_links.reduce((sum, link) => sum.plus(link.amount_covered), new Prisma.Decimal(0))).toFixed(2) })).filter(sheet => new Prisma.Decimal(sheet.remaining).greaterThan(0)),
  ];
}
