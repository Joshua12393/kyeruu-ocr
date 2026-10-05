import { NextResponse } from "next/server";
import { financeMutation } from "@/lib/mutations";
import { requireTransactionEditor, requireTreasurer } from "@/lib/auth";
import { apiError, ApiError, lockOpenGroup } from "@/lib/api";
import { updateGroupInput, positiveId } from "@/lib/validation";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(req: Request, context: Context) {
  try {
    const guard = await requireTransactionEditor(req);
    if (guard instanceof NextResponse) return guard;
    const id = positiveId.parse((await context.params).id);
    const { sides, ...input } = updateGroupInput.parse(await req.json());
    const group = await financeMutation(guard.user, async tx => {
      await lockOpenGroup(tx, id);
      const existing = await tx.scheduleGroup.findUniqueOrThrow({ where: { id }, include: { schedules: { include: { _count: { select: { disbursement_vouchers: true, acknowledgement_receipts: true, receipt_particulars: true } } } } } });
      const hasDependents = (side: typeof existing.schedules[number]) => Object.values(side._count).some(count => count > 0);
      if (input.academic_year && input.academic_year !== existing.academic_year) throw new ApiError(409, "A schedule cannot be moved to a different term.");
      if (input.semester && input.semester !== existing.semester && existing.schedules.some(hasDependents)) throw new ApiError(409, "The semester cannot change while financial records depend on this group.");
      if (sides) {
        const ids = sides.flatMap(side => side.id ? [side.id] : []);
        if (new Set(ids).size !== ids.length || ids.some(sideId => !existing.schedules.some(side => side.id === sideId))) throw new ApiError(400, "Side IDs must be distinct and belong to this group.");
        for (const old of existing.schedules) {
          const next = sides.find(side => side.id === old.id);
          if ((!next || next.type !== old.type) && hasDependents(old)) throw new ApiError(409, "A used side cannot be removed or change direction. Rename its label instead.");
        }
        // Free changing directions before updates to allow an unused pair to swap safely.
        for (const old of existing.schedules) {
          const next = sides.find(side => side.id === old.id);
          if (!next || next.type !== old.type) await tx.schedule.delete({ where: { id: old.id } });
        }
        for (const side of sides) {
          const old = existing.schedules.find(row => row.id === side.id);
          if (old && old.type === side.type) await tx.schedule.update({ where: { id: old.id }, data: { label: side.label } });
          else await tx.schedule.create({ data: { ...(old ? { id: old.id } : {}), schedule_group_id: id, type: side.type, label: side.label } });
        }
      }
      return tx.scheduleGroup.update({ where: { id }, data: input, include: { schedules: true } });
    });
    return NextResponse.json(group);
  } catch (error) { return apiError(error); }
}
export async function DELETE(req: Request, context: Context) {
  try {
    const guard = await requireTreasurer(req);
    if (guard instanceof NextResponse) return guard;
    const id = positiveId.parse((await context.params).id);
    await financeMutation(guard.user, async tx => {
      await lockOpenGroup(tx, id);
      const count = await tx.schedule.count({ where: { schedule_group_id: id, OR: [{ disbursement_vouchers: { some: {} } }, { acknowledgement_receipts: { some: {} } }, { receipt_particulars: { some: {} } }] } });
      if (count) throw new ApiError(409, "Cannot delete a group containing transactions or supporting items.");
      await tx.schedule.deleteMany({ where: { schedule_group_id: id } });
      await tx.scheduleGroup.delete({ where: { id } });
    });
    return NextResponse.json({ message: "Schedule group deleted." });
  } catch (error) { return apiError(error); }
}
