import { NextResponse } from "next/server";
import { requireFinanceAccess } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { financeFilters, financeQuery } from "@/lib/finance-query";
export async function GET(req: Request) {
  try {
    const guard = await requireFinanceAccess(req); if (guard instanceof NextResponse) return guard;
    const params = new URL(req.url).searchParams;
    const data = await financeQuery(financeFilters(params, guard.user.term));
    const attention = params.get("attention") === "1";
    const records = attention ? data.all_records.filter(row => row.incomplete || row.mismatch || !row.is_verified) : data.all_records;
    return NextResponse.json({ title: attention ? "Finance attention report" : "Supplementary finance totals", disclaimer: "Officer-entered records; not an official financial statement or an issued receipt.", totals_scope: "All active primary records matching the filters. Attention reports list only records requiring review; totals still describe the full filtered scope.", exported_at: new Date(), organization: "Single-organization pilot", filters: data.filters, totals: data.totals, records, outstanding_sheets: data.outstanding_sheets }, { headers: { "Content-Disposition": 'attachment; filename="finance-supplementary.json"', "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
