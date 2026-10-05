import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "./prisma";
import { date, positiveId } from "./validation";
import { ApiError } from "./api";

const filters = z.object({ term: z.string().max(50).optional(), from: date.optional(), to: date.optional(), schedule_id: positiveId.optional(), group_id: positiveId.optional(), activity: z.enum(["IGP", "MEMBERSHIP", "FINES", "EVENTS"]).optional(), semester: z.enum(["FIRST", "SECOND", "SUMMER"]).optional(), q: z.string().trim().max(100).default(""), status: z.enum(["all", "verified", "unverified", "incomplete", "mismatch"]).default("all"), kind: z.enum(["all", "DV", "AR"]).default("all"), page: positiveId.default(1), page_size: positiveId.refine(value => value <= 100).default(25) });
export function financeFilters(params: URLSearchParams, currentTerm?: string) {
  const input = filters.parse(Object.fromEntries([...params].filter(([, value]) => value !== "")));
  if (input.from && input.to && input.from > input.to) throw new ApiError(400, "The start date must not exceed the end date.");
  return { ...input, term: input.term || currentTerm || "all" };
}
export type FinanceFilters = ReturnType<typeof financeFilters>;
const groupWhere = (f: FinanceFilters): Prisma.ScheduleGroupWhereInput => ({ ...(f.term !== "all" ? { academic_year: f.term } : {}), ...(f.group_id ? { id: f.group_id } : {}), ...(f.activity ? { activity_type: f.activity } : {}), ...(f.semester ? { semester: f.semester } : {}) });
const groupInclude = { include: { group: true } };
export function evidenceState(amount: Prisma.Decimal | string, amounts: (Prisma.Decimal | string)[]) {
  const support = amounts.reduce<Prisma.Decimal>((sum, value) => sum.plus(value), new Prisma.Decimal(0));
  const difference = new Prisma.Decimal(amount).minus(support);
  return { support_total: support.toFixed(2), difference: difference.toFixed(2), incomplete: amounts.length === 0, mismatch: amounts.length > 0 && !difference.isZero() };
}
export async function financeQuery(f: FinanceFilters) {
  return prisma.$transaction(async tx => {
  const where = { deleted_at: null, schedule: { ...(f.schedule_id ? { id: f.schedule_id } : {}), group: groupWhere(f) }, ...(f.from || f.to ? { date: { ...(f.from ? { gte: new Date(f.from) } : {}), ...(f.to ? { lte: new Date(f.to) } : {}) } } : {}) };
  const [dvs, ars] = await Promise.all([
    f.kind === "AR" ? [] : tx.disbursementVoucher.findMany({ where: { ...where, ...(f.q ? { OR: [{ control_number: { contains: f.q } }, { purpose: { contains: f.q } }, { receipt_particulars: { some: { receipt: { OR: [{ reference_number: { contains: f.q } }, { internal_receipt_number: { contains: f.q } }] } } } }] } : {}) }, include: { schedule: groupInclude, scan_file: true, released_to: { select: { id: true, name: true } }, receipt_particulars: { include: { receipt: true } } } }),
    f.kind === "DV" ? [] : tx.acknowledgementReceipt.findMany({ where: { ...where, ...(f.q ? { OR: [{ control_number: { contains: f.q } }, { purpose: { contains: f.q } }, { ar_sheet_links: { some: { ar_supporting_document: { context_label: { contains: f.q } } } } }] } : {}) }, include: { schedule: groupInclude, scan_file: true, remitted_by: { select: { id: true, name: true } }, ar_sheet_links: true } }),
  ]);
  const all = [...dvs.map(row => ({ ...row, type: "DV" as const, ...evidenceState(row.amount, row.receipt_particulars.map(item => item.gross_amount)) })), ...ars.map(row => ({ ...row, type: "AR" as const, ...evidenceState(row.amount, row.ar_sheet_links.map(link => link.amount_covered)) }))].sort((a,b) => b.date.getTime() - a.date.getTime() || b.created_at.getTime() - a.created_at.getTime() || b.id - a.id || a.type.localeCompare(b.type));
  const records = all.filter(row => f.status === "all" || (f.status === "verified" ? row.is_verified : f.status === "unverified" ? !row.is_verified : f.status === "incomplete" ? row.incomplete : row.mismatch));
  const sum = (type: string, verified = false) => records.filter(row => row.type === type && (!verified || row.is_verified)).reduce((total, row) => total.plus(row.amount), new Prisma.Decimal(0));
  const inflow = sum("AR"), outflow = sum("DV");
  const totals = { inflow: inflow.toFixed(2), outflow: outflow.toFixed(2), net_movement: inflow.minus(outflow).toFixed(2), verified_inflow: sum("AR", true).toFixed(2), verified_outflow: sum("DV", true).toFixed(2), incomplete: records.filter(row => row.incomplete).length, mismatched: records.filter(row => row.mismatch).length, unverified: records.filter(row => !row.is_verified).length };
  const [supporting, sheets] = await Promise.all([
    tx.receipt.findMany({ where: { ...(f.term !== "all" ? { academic_year: f.term } : {}), ...(f.from || f.to ? { date: { ...(f.from ? { gte: new Date(f.from) } : {}), ...(f.to ? { lte: new Date(f.to) } : {}) } } : {}), particulars: { some: { schedule: { ...(f.schedule_id ? { id: f.schedule_id } : {}), group: groupWhere(f) } } }, ...(f.q ? { OR: [{ reference_number: { contains: f.q } }, { internal_receipt_number: { contains: f.q } }, { particulars: { some: { particular_name: { contains: f.q } } } }] } : {}) }, include: { particulars: { include: { schedule: groupInclude } } }, take: 100, orderBy: { id: "desc" } }),
    tx.aRSupportingDocument.findMany({ where: { ...(f.term !== "all" ? { academic_year: f.term } : {}), ...(f.q ? { context_label: { contains: f.q } } : {}), ...(f.schedule_id || f.group_id || f.activity || f.semester ? { ar_sheet_links: { some: { acknowledgement_receipt: { schedule: { ...(f.schedule_id ? { id: f.schedule_id } : {}), group: groupWhere(f) } } } } } : {}) }, include: { ar_sheet_links: true } }),
  ]);
  const outstanding = sheets.map(sheet => ({ ...sheet, remaining: new Prisma.Decimal(sheet.total_amount).minus(sheet.ar_sheet_links.reduce((sum, link) => sum.plus(link.amount_covered), new Prisma.Decimal(0))).toFixed(2) })).filter(sheet => new Prisma.Decimal(sheet.remaining).greaterThan(0));
  return { filters: f, totals, count: records.length, pages: Math.max(1, Math.ceil(records.length / f.page_size)), records: records.slice((f.page - 1) * f.page_size, f.page * f.page_size), supporting, outstanding_sheets: outstanding, all_records: records };
  }, { isolationLevel: "RepeatableRead", timeout: 30000 });
}
