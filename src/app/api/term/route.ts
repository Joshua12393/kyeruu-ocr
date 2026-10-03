import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTreasurer, requireFinanceAccess } from "@/lib/auth";
import { apiError, lockOpenGroup } from "@/lib/api";
import { positiveId } from "@/lib/validation";
import { z } from "zod";
export async function POST(req: Request) {
  try {
    const guard = await requireTreasurer(req);
    if (guard instanceof NextResponse) return guard;
    const { groupId } = z.object({ groupId: positiveId }).parse(await req.json());
    const group = await prisma.$transaction(async tx => {
      await lockOpenGroup(tx, groupId);
      return tx.scheduleGroup.update({ where: { id: groupId }, data: { is_closed: true, closed_at: new Date() } });
    });
    return NextResponse.json({ message: "Term closed successfully", group });
  } catch (error) { return apiError(error); }
}
export async function GET(req: Request) {
  try {
    const guard = await requireFinanceAccess(req);
    if (guard instanceof NextResponse) return guard;
    const data = await prisma.scheduleGroup.findMany({ include: { schedules: { include: {
      disbursement_vouchers: { include: { scan_file: true, receipt_particulars: { include: { receipt: { include: { scan_file: true } } } }, verification_events: true } },
      acknowledgement_receipts: { include: { scan_file: true, ar_sheet_links: { include: { ar_supporting_document: { include: { scan_file: true } } } }, verification_events: true } },
    } } } });
    return NextResponse.json({ exported_at: new Date(), content: data });
  } catch (error) { return apiError(error); }
}
