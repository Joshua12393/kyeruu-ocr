import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { requireSameOrigin } from "@/lib/accounts";
import { apiError, ApiError } from "@/lib/api";
import { currentTermName } from "@/lib/terms";

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Enter a real calendar date.");
const termInput = z.object({ name: z.string().trim().min(1).max(50), starts_on: calendarDate.nullable(), ends_on: calendarDate.nullable(), make_current: z.boolean(), version: z.number().int().nonnegative() }).strict()
  .refine(value => (!value.starts_on && !value.ends_on) || (!!value.starts_on && !!value.ends_on && value.starts_on <= value.ends_on), "Enter both dates with the start on or before the end, or leave both unset.");
export async function GET(req: Request) {
  try {
    const guard = await requireAdmin(req); if (guard instanceof NextResponse) return guard;
    return NextResponse.json({ current_term: await currentTermName(), version: (await prisma.omsSettings.findUnique({ where: { id: 1 } }))?.version || 0, terms: await prisma.academicTerm.findMany({ orderBy: { name: "desc" } }) });
  } catch (error) { return apiError(error); }
}
export async function POST(req: Request) {
  try {
    const guard = await requireAdmin(req); if (guard instanceof NextResponse) return guard;
    requireSameOrigin(req);
    const input = termInput.parse(await req.json());
    await prisma.$transaction(async tx => {
      // Stable singleton lock even before settings have first been saved.
      await tx.$queryRaw`SELECT id FROM oms_settings WHERE id = 1 FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM users WHERE role_type = 'ADMIN' ORDER BY id FOR UPDATE`;
      const actor = await tx.user.findUnique({ where: { id: guard.user.id } });
      if (!actor?.is_active || actor.deleted_at || actor.role_type !== "ADMIN") throw new ApiError(403, "Admin access is no longer active.");

      const settings = await tx.omsSettings.findUnique({ where: { id: 1 } });
      if ((settings?.version || 0) !== input.version) throw new ApiError(409, "Term settings changed. Reload before saving.");
      const existing = await tx.academicTerm.findUnique({ where: { name: input.name } });
      if (existing?.closed_at) throw new ApiError(403, "Closed term calendars cannot be changed or reopened.");
      const data = { starts_on: input.starts_on ? new Date(input.starts_on) : null, ends_on: input.ends_on ? new Date(input.ends_on) : null };
      await tx.academicTerm.upsert({ where: { name: input.name }, create: { name: input.name, ...data }, update: data });
      await tx.omsSettings.upsert({ where: { id: 1 }, create: { id: 1, current_term: input.make_current ? input.name : await currentTermName(), version: 1 }, update: { ...(input.make_current ? { current_term: input.name } : {}), version: { increment: 1 } } });
    });
    return NextResponse.json({ message: "OMS term saved. Officers must have an assignment for the current term; reload Finance to update its capabilities." });
  } catch (error) { return apiError(error); }
}
