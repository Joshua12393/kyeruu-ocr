import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireFinanceAccess, requireTransactionEditor } from "@/lib/auth";
import { groupInput } from "@/lib/validation";
import { apiError } from "@/lib/api";
import { DEFAULT_SCHEDULE_SIDES } from "@/lib/schedules";
export async function GET(req: Request) {
  try {
    const guard = await requireFinanceAccess(req);
    if (guard instanceof NextResponse) return guard;
    return NextResponse.json(await prisma.scheduleGroup.findMany({ include: { schedules: true }, orderBy: { schedule_number: "asc" } }));
  } catch (error) { return apiError(error); }
}
export async function POST(req: Request) {
  try {
    const guard = await requireTransactionEditor(req);
    if (guard instanceof NextResponse) return guard;
    const input = groupInput.parse(await req.json());
    const group = await prisma.scheduleGroup.create({ data: { ...input, schedules: { create: DEFAULT_SCHEDULE_SIDES[input.activity_type] } }, include: { schedules: true } });
    return NextResponse.json(group, { status: 201 });
  } catch (error) { return apiError(error); }
}
