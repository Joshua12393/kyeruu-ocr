import { NextResponse } from "next/server";
import { requireTransactionEditor } from "./auth";
import { apiError, ApiError } from "./api";
import { assertAvailableScan } from "./transactions";
import { financeMutation, primary, assertVersion, invalidatePrimary, auditMutation, lockGroups } from "./mutations";
import { positiveId } from "./validation";
import { z } from "zod";
export async function linkDocument(req: Request) {
  try {
    const guard = await requireTransactionEditor(req); if (guard instanceof NextResponse) return guard;
    const input = z.object({ scan_id: positiveId, transaction_type: z.enum(["DV", "AR"]), transaction_id: positiveId, version: positiveId }).parse(await req.json());
    await financeMutation(guard.user, async tx => {
      const current = await primary(tx, input.transaction_type, input.transaction_id);
      await lockGroups(tx, [current.schedule.schedule_group_id]);
      assertVersion(current, input.version);
      if (current.scan_file_id) throw new ApiError(409, "This transaction already has a scan. Use its edit form to replace or remove it.");
      await assertAvailableScan(tx, input.scan_id, guard.user.id);
      await invalidatePrimary(tx, input.transaction_type, current.id, guard.user.id, "SCAN_LINKED", input.version);
      const data = { scan_file_id: input.scan_id };
      const after = input.transaction_type === "DV" ? await tx.disbursementVoucher.update({ where: { id: current.id }, data }) : await tx.acknowledgementReceipt.update({ where: { id: current.id }, data });
      await auditMutation(tx, guard.user.id, input.transaction_type, current.id, "ATTACH_SCAN", current, after);
    });
    return NextResponse.json({ message: "Document linked successfully." });
  } catch (error) { return apiError(error); }
}
