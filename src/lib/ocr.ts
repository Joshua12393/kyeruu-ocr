import { NextResponse } from "next/server";
import prisma from "./prisma";
import { requireTransactionEditor } from "./auth";
import { apiError, ApiError, assertScheduleDirection } from "./api";
import { validateImage, saveImage, removeImage, readImage } from "./storage";
import { financeMutation, auditMutation, lockGroups } from "./mutations";
import { documentContext, allowedDocumentTypes } from "./ocr-draft";
import { limitedOcr } from "./ocr-limit";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
// Inference runs outside the financial lock. Its completion must not mutate a
// scan after closure/turnover while an archive is taking a consistent snapshot.
async function finishScan(id: number, version: number, data: Prisma.DocumentScanUpdateManyMutationInput) {
  return prisma.$transaction(async tx => {
    const settings = await tx.$queryRaw<{ current_term: string }[]>`SELECT current_term FROM oms_settings WHERE id = 1 FOR UPDATE`;
    const scan = await tx.documentScan.findUnique({ where: { id } });
    if (!scan || scan.academic_year !== settings[0]?.current_term) return { count: 0 };
    const term = await tx.academicTerm.findUnique({ where: { name: scan.academic_year } });
    if (term?.closed_at) return { count: 0 };
    if (scan.suggested_schedule_id) {
      const side = await tx.schedule.findUnique({ where: { id: scan.suggested_schedule_id }, include: { group: true } });
      if (side?.group.is_closed) return { count: 0 };
    }
    return tx.documentScan.updateMany({ where: { id, ocr_version: version }, data });
  });
}
const resultSchema = z.object({ pipeline: z.enum(["printed", "handwritten"]), raw_text: z.string(), overall_confidence: z.number().min(0).max(1), fields: z.array(z.object({ field_name: z.string(), value: z.string(), confidence: z.number().min(0).max(1) })), line_items: z.array(z.object({ particular: z.string(), amount: z.number().nonnegative(), quantity: z.number().nullable().optional(), unit_cost: z.number().nullable().optional(), confidence: z.number().min(0).max(1) })), engine: z.string().max(100).nullable().optional() });
export async function processOcr(req: Request) {
  let scanId: number | undefined, version: number | undefined;
  try {
    const guard = await requireTransactionEditor(req); if (guard instanceof NextResponse) return guard;
    const form = await req.formData();
    const context = form.get("schedule_id") || form.get("document_type") ? documentContext.parse({ schedule_id: form.get("schedule_id"), mode: form.get("mode"), document_type: form.get("document_type") }) : null;
    const sheet = context?.document_type === "COLLECTION_SHEET" || context?.document_type === "SALES_SHEET";
    const pipeline = sheet ? "manual" : z.enum(["printed", "handwritten", "manual"]).parse(form.get("pipeline"));
    const retryId = form.get("scan_id") ? z.coerce.number().int().positive().parse(form.get("scan_id")) : null;
    const image = retryId ? null : await validateImage(form.get("file"));
    const location = image ? await saveImage(image) : null;
    let scan;
    try {
      scan = await financeMutation(guard.user, async tx => {
        if (context) { const side = await tx.schedule.findUnique({ where: { id: context.schedule_id } }); if (!side || !allowedDocumentTypes(side.type, context.mode).includes(context.document_type)) throw new ApiError(400, "Document type does not match the selected schedule and mode."); await lockGroups(tx, [side.schedule_group_id]); await assertScheduleDirection(tx, side.id, side.type); }
        const data = { document_type: context?.document_type || null, suggested_schedule_id: context?.schedule_id || null, ocr_status: pipeline === "manual" ? "MANUAL" as const : "PENDING" as const, ocr_pipeline: pipeline === "manual" ? "NONE" as const : pipeline === "printed" ? "PRINTED" as const : "HANDWRITTEN" as const, ocr_started_at: new Date() };
        if (retryId) {
          const current = await tx.documentScan.findUnique({ where: { id: retryId }, include: { _count: { select: { receipts: true, ar_supporting_documents: true, disbursement_vouchers: { where: { deleted_at: null } }, acknowledgement_receipts: { where: { deleted_at: null } } } } } });
          if (!current || current.academic_year !== guard.user.term) throw new ApiError(403, "Retry only a saved scan in the current term.");
          if (current.suggested_schedule_id) {
            const originalSide = await tx.schedule.findUnique({ where: { id: current.suggested_schedule_id } });
            if (originalSide) await lockGroups(tx, [originalSide.schedule_group_id]);
          }
          if (Object.values(current._count).some(count => count > 0)) throw new ApiError(409, "This scan is already committed. Review it in its saved document.");
          if (current.ocr_status === "PENDING" && current.ocr_started_at && Date.now() - current.ocr_started_at.getTime() < 300000) throw new ApiError(409, "This scan is still processing. Retry after it finishes.");
          const updated = await tx.documentScan.update({ where: { id: retryId }, data: { ...data, ocr_version: { increment: 1 } } }); await auditMutation(tx, guard.user.id, "SCAN", retryId, "OCR_RETRY", current, updated); return updated;
        }
        const saved = await tx.documentScan.create({ data: { ...data, academic_year: guard.user.term, file_path: location!, uploaded_by_id: guard.user.id, ocr_version: 1 } }); await auditMutation(tx, guard.user.id, "SCAN", saved.id, "UPLOAD", null, saved); return saved;
      });
    } catch (error) { if (location) await removeImage(location); throw error; }
    scanId = scan.id; version = scan.ocr_version;
    if (pipeline === "manual") return NextResponse.json({ scanId, extractedData: null, status: "MANUAL" }, { status: 201 });
    const stored = image || await readImage(scan.file_path); const started = Date.now();
    const result = await limitedOcr(async () => {
      const ocrForm = new FormData(); ocrForm.append("file", new Blob([new Uint8Array(stored.bytes)], { type: stored.mime }), "scan.png");
      const base = (process.env.OCR_SERVICE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
      let response: Response;
      try { response = await fetch(base + "/api/ocr/extract/" + pipeline, { method: "POST", body: ocrForm, signal: AbortSignal.timeout(180000), headers: process.env.OCR_SERVICE_TOKEN ? { "X-OCR-Token": process.env.OCR_SERVICE_TOKEN } : {} }); } catch { throw new ApiError(503, "OCR is unavailable. The saved scan is ready for manual review or retry without re-uploading."); }
      if (!response.ok) throw new ApiError(response.status === 422 ? 422 : 502, "OCR could not read this image. Its original is retained for manual review.");
      const parsed = resultSchema.parse(await response.json()); if (!parsed.raw_text.trim() || parsed.pipeline !== pipeline) throw new ApiError(422, "No valid extraction was returned. Use the saved scan for manual entry."); return parsed;
    });
    const changed = await finishScan(scanId, version, { ocr_status: "PROCESSED", ocr_raw_text: JSON.stringify(result), ocr_engine: result.engine || "PaddleOCR service (version unreported)", ocr_duration_ms: Date.now() - started });
    if (!changed.count) throw new ApiError(409, "A newer review, closure or term turnover prevented this extraction update. Its original is retained.");
    return NextResponse.json({ scanId, extractedData: result, status: "PROCESSED" });
  } catch (error) {
    if (scanId && version) await finishScan(scanId, version, { ocr_status: "FAILED" }).catch(console.error);
    const response = apiError(error); if (scanId) return NextResponse.json({ ...await response.json(), scanId }, { status: response.status }); return response;
  }
}
