import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTransactionEditor } from "@/lib/auth";
import { apiError, ApiError } from "@/lib/api";
import { validateImage, saveImage, removeImage } from "@/lib/storage";
import { z } from "zod";

const resultSchema = z.object({
  pipeline: z.enum(["printed", "handwritten"]), raw_text: z.string(),
  overall_confidence: z.number().min(0).max(1),
  fields: z.array(z.object({ field_name: z.string(), value: z.string(), confidence: z.number().min(0).max(1) })),
  line_items: z.array(z.object({ particular: z.string(), amount: z.number().nonnegative(), quantity: z.number().nullable().optional(), unit_cost: z.number().nullable().optional(), confidence: z.number().min(0).max(1) })),
});

export async function processOcr(req: Request) {
  let scanId: number | undefined;
  try {
    const guard = await requireTransactionEditor(req);
    if (guard instanceof NextResponse) return guard;
    const form = await req.formData();
    const pipeline = z.enum(["printed", "handwritten", "manual"]).parse(form.get("pipeline"));
    const image = await validateImage(form.get("file"));
    const location = await saveImage(image);
    let scan;
    try {
      scan = await prisma.documentScan.create({ data: { file_path: location, uploaded_by_id: guard.user.id, ocr_status: pipeline === "manual" ? "MANUAL" : "PENDING", ocr_pipeline: pipeline === "manual" ? "NONE" : pipeline === "printed" ? "PRINTED" : "HANDWRITTEN" } });
    } catch (error) { await removeImage(location); throw error; }
    scanId = scan.id;
    if (pipeline === "manual") return NextResponse.json({ scanId, extractedData: null, status: "MANUAL" }, { status: 201 });
    const ocrForm = new FormData();
    ocrForm.append("file", new Blob([new Uint8Array(image.bytes)], { type: image.mime }), `scan.${image.extension}`);
    const base = (process.env.OCR_SERVICE_URL || process.env.NEXT_PUBLIC_OCR_SERVICE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
    let response: Response;
    try {
      response = await fetch(`${base}/api/ocr/extract/${pipeline}`, { method: "POST", body: ocrForm, signal: AbortSignal.timeout(180000), headers: process.env.OCR_SERVICE_TOKEN ? { "X-OCR-Token": process.env.OCR_SERVICE_TOKEN } : {} });
    } catch { throw new ApiError(503, "OCR service is unavailable. Your scan was saved; use manual entry or retry later."); }
    if (!response.ok) throw new ApiError(502, "OCR could not read this image. Your scan was saved for manual entry.");
    const result = resultSchema.parse(await response.json());
    if (!result.raw_text.trim()) throw new ApiError(422, "No readable text was found. Your scan was saved for manual entry.");
    await prisma.documentScan.update({ where: { id: scanId }, data: { ocr_status: "PROCESSED", ocr_raw_text: JSON.stringify(result) } });
    return NextResponse.json({ scanId, extractedData: result, status: "PROCESSED" });
  } catch (error) {
    if (scanId) await prisma.documentScan.update({ where: { id: scanId }, data: { ocr_status: "FAILED" } }).catch(console.error);
    const response = apiError(error);
    if (scanId) return NextResponse.json({ ...await response.json(), scanId }, { status: response.status });
    return response;
  }
}
