import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireFinanceAccess } from "@/lib/auth";
import { apiError, ApiError } from "@/lib/api";
import prisma from "@/lib/prisma";
import { positiveId } from "@/lib/validation";
import { evidenceState } from "@/lib/finance-query";
import { z } from "zod";
export async function GET(req: Request, context: { params: Promise<{ kind: string; id: string }> }) {
  try {
    const guard = await requireFinanceAccess(req); if (guard instanceof NextResponse) return guard;
    const params = await context.params; const kind = z.enum(["DV", "AR"]).parse(params.kind), id = positiveId.parse(params.id);
    const result = await prisma.$transaction(async tx => {
      const record = kind === "DV" ? await tx.disbursementVoucher.findUnique({ where: { id }, include: { schedule: { include: { group: true } }, released_to: { select: { id: true, name: true } }, scan_file: true, receipt_particulars: { include: { receipt: { include: { scan_file: true } } } }, verification_events: { include: { user: { select: { id: true, name: true } } }, orderBy: { id: "desc" } } } }) : await tx.acknowledgementReceipt.findUnique({ where: { id }, include: { schedule: { include: { group: true } }, remitted_by: { select: { id: true, name: true } }, scan_file: true, ar_sheet_links: { include: { ar_supporting_document: { include: { scan_file: true, ar_sheet_links: true } } } }, verification_events: { include: { user: { select: { id: true, name: true } } }, orderBy: { id: "desc" } } } });
      if (!record) throw new ApiError(404, "Transaction not found.");
      const evidence = "receipt_particulars" in record ? record.receipt_particulars.map(item => ({ kind: "RECEIPT", document_id: item.receipt_id, scan_id: item.receipt.scan_file_id, label: item.particular_name, amount: item.gross_amount.toFixed(2), schedule_id: item.schedule_id, quantity: item.quantity.toFixed(2), unit_cost: item.unit_cost.toFixed(2) })) : record.ar_sheet_links.map(link => ({ kind: "SHEET", document_id: link.ar_supporting_document_id, scan_id: link.ar_supporting_document.scan_file_id, label: link.ar_supporting_document.context_label, amount: link.amount_covered.toFixed(2), total: link.ar_supporting_document.total_amount.toFixed(2), remaining: link.ar_supporting_document.total_amount.minus(link.ar_supporting_document.ar_sheet_links.reduce((sum, row) => sum.plus(row.amount_covered), new Prisma.Decimal(0))).toFixed(2) }));
      const supportKind = kind === "DV" ? "RECEIPT" : "SHEET";
      const linkPath = kind === "DV" ? "$.particulars[*].dv_id" : "$.ar_sheet_links[*].ar_id";
      const previous = await tx.$queryRaw<{ target_id: number }[]>`SELECT DISTINCT target_id FROM financial_mutations WHERE target_type = ${supportKind} AND (JSON_CONTAINS(JSON_EXTRACT(\`before\`, ${linkPath}), ${JSON.stringify(id)}) OR JSON_CONTAINS(JSON_EXTRACT(\`after\`, ${linkPath}), ${JSON.stringify(id)}))`;
      const supportIds = [...new Set([...evidence.map(item => item.document_id), ...previous.map(row => row.target_id)])];
      const history = await tx.financialMutation.findMany({ where: { OR: [{ target_type: kind, target_id: id }, { target_type: supportKind, target_id: { in: supportIds } }] }, orderBy: { id: "desc" } });
      const historical = new Map<string, { kind: string; document_id: number; scan_id: number; label: string }>();
      for (const event of history.filter(event => event.target_type === supportKind)) for (const snapshot of [event.before,event.after]) {
        if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) continue;
        const scanId = snapshot.scan_file_id;
        if (typeof scanId === "number" && !evidence.some(item => item.scan_id === scanId)) historical.set(event.target_id + ":" + scanId,{ kind: supportKind,document_id: event.target_id,scan_id: scanId,label: String(snapshot.internal_receipt_number || snapshot.context_label || "Previous supporting evidence") });
      }
      return { ...record, type: kind, evidence, historical_evidence: [...historical.values()], mutation_history: history, ...evidenceState(record.amount, evidence.map(item => item.amount)) };
    });
    return NextResponse.json(result);
  } catch (error) { return apiError(error); }
}
