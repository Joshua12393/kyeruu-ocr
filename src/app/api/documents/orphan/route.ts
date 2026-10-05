import { NextResponse } from "next/server";
import { requireFinanceAccess } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { orphanDocuments } from "@/lib/orphans";
import { financeFilters } from "@/lib/finance-query";
export async function GET(req: Request) {
  try { const guard = await requireFinanceAccess(req); if (guard instanceof NextResponse) return guard; const f = financeFilters(new URL(req.url).searchParams); return NextResponse.json(await orphanDocuments(f.term, f.schedule_id)); } catch (error) { return apiError(error); }
}
export { linkDocument as POST } from "@/lib/document-links";
