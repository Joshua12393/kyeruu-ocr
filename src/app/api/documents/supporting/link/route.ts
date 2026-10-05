import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTransactionEditor } from "@/lib/auth";
import { apiError, ApiError } from "@/lib/api";
import { money, positiveId } from "@/lib/validation";
import { financeMutation, assertVersion, primary } from "@/lib/mutations";
import { supportDocument, saveSupporting } from "@/lib/supporting";
import { supportingInput } from "@/lib/supporting-validation";
export async function POST(req: Request) {
  try {
    const guard = await requireTransactionEditor(req); if (guard instanceof NextResponse) return guard;
    const input = z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("PARTICULAR"), document_id: positiveId, document_version: positiveId, transaction_id: positiveId, version: positiveId }),
      z.object({ kind: z.literal("SHEET"), document_id: positiveId, document_version: positiveId, transaction_id: positiveId, version: positiveId, amount_covered: money }),
    ]).parse(await req.json());
    await financeMutation(guard.user, async tx => {
      const item = input.kind === "PARTICULAR" ? await tx.receiptParticular.findUnique({ where: { id: input.document_id } }) : null;
      if (input.kind === "PARTICULAR" && !item) throw new ApiError(404, "Receipt item not found.");
      if (item?.dv_id) throw new ApiError(409, "Item already linked. Edit the saved support to unlink or reassign it.");
      const doc = await supportDocument(tx, item ? "RECEIPT" : "SHEET", item?.receipt_id || input.document_id);
      assertVersion(doc, input.document_version);
      const target = await primary(tx, item ? "DV" : "AR", input.transaction_id); assertVersion(target, input.version);
      const parent_versions: { type: "DV" | "AR"; id: number; version: number }[] = [];
      if ("particulars" in doc) {
        for (const id of [...new Set(doc.particulars.flatMap(row => row.dv_id ? [row.dv_id] : []))]) parent_versions.push({ type: "DV", id, version: (await primary(tx, "DV", id)).version });
        const particulars = doc.particulars.map(row => ({ id: row.id, particular_name: row.particular_name, quantity: row.quantity.toString(), unit_cost: row.unit_cost.toString(), schedule_id: row.schedule_id, ...(row.id === item?.id ? { link: { transaction_id: target.id, version: input.version } } : row.dv_id ? { link: { transaction_id: row.dv_id, version: parent_versions.find(parent => parent.id === row.dv_id)!.version } } : {}) }));
        await saveSupporting(tx, guard.user, supportingInput.parse({ kind: "RECEIPT", version: doc.version, scan_id: doc.scan_file_id, internal_receipt_number: doc.internal_receipt_number, reference_number: doc.reference_number, date: doc.date.toISOString().slice(0,10), doc_type: doc.doc_type, particulars, parent_versions }), doc.id);
      } else {
        if (doc.ar_sheet_links.some(link => link.ar_id === target.id)) throw new ApiError(409, "Sheet already linked to this AR.");
        for (const link of doc.ar_sheet_links) parent_versions.push({ type: "AR", id: link.ar_id, version: (await primary(tx, "AR", link.ar_id)).version });
        await saveSupporting(tx, guard.user, supportingInput.parse({ kind: "SHEET", version: doc.version, scan_id: doc.scan_file_id, doc_type: doc.doc_type, context_label: doc.context_label, period_covered: doc.period_covered || "", total_amount: doc.total_amount.toString(), parent_versions, links: [...doc.ar_sheet_links.map(link => ({ transaction_id: link.ar_id, version: parent_versions.find(parent => parent.id === link.ar_id)!.version, amount_covered: link.amount_covered.toString() })), { transaction_id: target.id, version: input.version, amount_covered: input.kind === "SHEET" ? input.amount_covered : "0" }] }), doc.id);
      }
    });
    return NextResponse.json({ message: "Supporting document linked." });
  } catch (error) { return apiError(error); }
}
