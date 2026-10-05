import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { createFinanceArchive } from "@/lib/finance-archive";
import { z } from "zod";
export async function GET(req: Request) {
  try { const guard = await requireAdmin(req); if (guard instanceof NextResponse) return guard; const term = z.string().trim().min(1).max(50).parse(new URL(req.url).searchParams.get("term")); return NextResponse.json(await createFinanceArchive(term, guard.user.id), { headers: { "Content-Disposition": 'attachment; filename="finance-term-archive.json"', "Cache-Control": "private, no-store" } }); } catch (error) { return apiError(error); }
}
