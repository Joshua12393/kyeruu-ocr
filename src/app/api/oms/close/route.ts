import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { requireSameOrigin } from "@/lib/accounts";
import { apiError, ApiError } from "@/lib/api";
import { auditMutation } from "@/lib/mutations";
export async function POST(req: Request) {
  try {
    const guard = await requireAdmin(req); if (guard instanceof NextResponse) return guard; requireSameOrigin(req);
    const input = z.object({ term: z.string().trim().min(1).max(50), version: z.number().int().positive(), confirmation: z.literal("CLOSE TERM") }).strict().parse(await req.json());
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM oms_settings WHERE id = 1 FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${guard.user.id} FOR UPDATE`;
      const actor = await tx.user.findUnique({ where: { id: guard.user.id } }); if (!actor?.is_active || actor.deleted_at || actor.role_type !== "ADMIN") throw new ApiError(403, "Admin access changed.");
      const settings = await tx.omsSettings.findUnique({ where: { id: 1 } }); if (settings?.version !== input.version) throw new ApiError(409, "Term settings changed. Reload before closing.");
      const term = await tx.academicTerm.findUnique({ where: { name: input.term } }); if (!term) throw new ApiError(404, "Term not found."); if (term.closed_at) throw new ApiError(409, "This term is already closed. Reopening is unavailable.");
      const now = new Date(); const after = await tx.academicTerm.update({ where: { name: input.term }, data: { closed_at: now, closed_by_id: guard.user.id } });
      const groups = await tx.scheduleGroup.updateMany({ where: { academic_year: input.term, is_closed: false }, data: { is_closed: true, closed_at: now } });
      await tx.omsSettings.update({ where: { id: 1 }, data: { version: { increment: 1 } } });
      await auditMutation(tx, guard.user.id, "TERM", 0, "CLOSE_TERM", term, { ...after, groups_closed: groups.count });
      return { term: after, groups_closed: groups.count };
    });
    return NextResponse.json({ message: "Term closed. Records and scans remain readable; all writes are blocked. Reopening is unavailable.", ...result });
  } catch (error) { return apiError(error); }
}
