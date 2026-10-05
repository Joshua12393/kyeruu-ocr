import { NextResponse } from "next/server";
import { requireFinanceAccess } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { financeFilters, financeQuery } from "@/lib/finance-query";
import { orphanDocuments } from "@/lib/orphans";
export async function GET(req: Request) {
  try {
    const guard = await requireFinanceAccess(req); if (guard instanceof NextResponse) return guard;
    const f = financeFilters(new URL(req.url).searchParams); const data = await financeQuery(f);
    const incomplete = { vouchers: data.all_records.filter(row => row.type === "DV" && row.incomplete), receipts: data.all_records.filter(row => row.type === "AR" && row.incomplete) };
    const mismatches = { vouchers: data.all_records.filter(row => row.type === "DV" && row.mismatch), receipts: data.all_records.filter(row => row.type === "AR" && row.mismatch) };
    const orphans = await orphanDocuments(f.term, f.schedule_id);
    return NextResponse.json({ incomplete, mismatches, orphans, outstanding_sheets: data.outstanding_sheets, summary: { total_incomplete: incomplete.vouchers.length + incomplete.receipts.length, total_mismatches: mismatches.vouchers.length + mismatches.receipts.length, unassigned_scans: orphans.filter(row => row.kind === "SCAN").length, unlinked_items: orphans.filter(row => row.kind === "PARTICULAR").length, uncovered_sheets: orphans.filter(row => row.kind === "SHEET").length } });
  } catch (error) { return apiError(error); }
}
