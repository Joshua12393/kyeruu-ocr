import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTransactionEditor, requireTreasurer } from "@/lib/auth";
import { apiError, ApiError, lockOpenGroup } from "@/lib/api";
import { groupInput, positiveId } from "@/lib/validation";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(req: Request, context: Context) {
  try {
    const guard = await requireTransactionEditor(req);
    if (guard instanceof NextResponse) return guard;
    const id = positiveId.parse((await context.params).id);
    const input = groupInput.partial().parse(await req.json());
    const group = await prisma.$transaction(async tx => {
      await lockOpenGroup(tx, id);
      const count = await tx.schedule.count({ where: { schedule_group_id: id, OR: [{ disbursement_vouchers: { some: {} } }, { acknowledgement_receipts: { some: {} } }, { receipt_particulars: { some: {} } }] } });
      if (count) throw new ApiError(409, "This schedule group contains transactions and cannot be modified.");
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
    await prisma.$transaction(async tx => {
      await lockOpenGroup(tx, id);
      const count = await tx.schedule.count({ where: { schedule_group_id: id, OR: [{ disbursement_vouchers: { some: {} } }, { acknowledgement_receipts: { some: {} } }, { receipt_particulars: { some: {} } }] } });
      if (count) throw new ApiError(409, "Cannot delete a group containing transactions or supporting items.");
      await tx.schedule.deleteMany({ where: { schedule_group_id: id } });
      await tx.scheduleGroup.delete({ where: { id } });
    });
    return NextResponse.json({ message: "Schedule group deleted." });
  } catch (error) { return apiError(error); }
}
