import { NextResponse } from "next/server";
import { requireFinanceAccess } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { financeFilters, financeQuery } from "@/lib/finance-query";
export async function GET(req: Request) {
  try { const guard = await requireFinanceAccess(req); if (guard instanceof NextResponse) return guard; const { all_records, ...data } = await financeQuery(financeFilters(new URL(req.url).searchParams, guard.user.term)); void all_records; return NextResponse.json(data); } catch (error) { return apiError(error); }
}
