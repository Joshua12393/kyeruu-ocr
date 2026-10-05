import { NextResponse } from "next/server";
import { requireFinanceAccess } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { apiError } from "@/lib/api";
export async function GET(req: Request) {
  try {
    const guard = await requireFinanceAccess(req); if (guard instanceof NextResponse) return guard;
    const name = (new URL(req.url).searchParams.get("name") || "").trim().slice(0,255); if (name.length < 2) return NextResponse.json([]);
    const history = await prisma.receiptParticular.findMany({ where: { particular_name: { equals: name }, OR: [{ dv_id: null }, { voucher: { deleted_at: null } }] }, include: { schedule: { include: { group: true } } }, take: 500 });
    if (!history.length) return NextResponse.json([]);
    const counts = new Map<string,number>(); for (const item of history) counts.set(item.schedule.group.activity_type, (counts.get(item.schedule.group.activity_type) || 0) + 1);
    const sides = await prisma.schedule.findMany({ where: { type: "OUTFLOW", group: { academic_year: guard.user.term, is_closed: false, activity_type: { in: [...counts.keys()] as ("IGP" | "MEMBERSHIP" | "FINES" | "EVENTS")[] } } }, include: { group: true } });
    return NextResponse.json(sides.map(side => ({ schedule_id: side.id, label: side.label, activity: side.group.activity_type, examples: counts.get(side.group.activity_type), reason: "Previous officer-confirmed items with the same name; choose explicitly to apply." })).sort((a,b) => (b.examples || 0) - (a.examples || 0)).slice(0,5));
  } catch (error) { return apiError(error); }
}
