import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireFinanceAccess, requireTransactionEditor } from "@/lib/auth";
import { createGroupInput } from "@/lib/validation";
import { apiError, ApiError } from "@/lib/api";
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
    const { sides, ...input } = createGroupInput.parse(await req.json());
    if (input.academic_year !== guard.user.term) throw new ApiError(403, "Create schedules only in the current OMS term.");
    if (sides?.some(side => side.id)) throw new ApiError(400, "New schedule sides cannot use existing IDs.");
    const group = await prisma.$transaction(async tx => {
      // Serialize calendar/turnover with group creation too.
      const settings = await tx.$queryRaw<{ current_term: string }[]>`SELECT current_term FROM oms_settings WHERE id = 1 FOR UPDATE`;
      if ((settings[0]?.current_term || process.env.FINANCE_CURRENT_TERM?.trim()) !== input.academic_year) throw new ApiError(409, "The active term changed. Reload before saving.");
      const { calendarWriteError } = await import("@/lib/terms");
      const restriction = calendarWriteError(await tx.academicTerm.findUnique({ where: { name: input.academic_year } }));
      if (restriction) throw new ApiError(403, restriction);
      return tx.scheduleGroup.create({ data: { ...input, schedules: { create: sides || DEFAULT_SCHEDULE_SIDES[input.activity_type] } }, include: { schedules: true } });
    });
    return NextResponse.json(group, { status: 201 });
  } catch (error) { return apiError(error); }
}
