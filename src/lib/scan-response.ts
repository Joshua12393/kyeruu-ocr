import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireFinanceAccess } from "@/lib/auth";
import { readImage } from "@/lib/storage";
import { apiError, ApiError } from "@/lib/api";
import { positiveId } from "@/lib/validation";

export async function downloadScan(req: Request, filePath?: string) {
  try {
    const guard = await requireFinanceAccess(req);
    if (guard instanceof NextResponse) return guard;
    const scan = filePath ? await prisma.documentScan.findFirst({ where: { file_path: filePath } }) : await prisma.documentScan.findUnique({ where: { id: positiveId.parse(new URL(req.url).searchParams.get("scanId")) } });
    if (!scan) throw new ApiError(404, "Scan not found.");
    const { bytes, mime } = await readImage(scan.file_path);
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return apiError(error); }
}
