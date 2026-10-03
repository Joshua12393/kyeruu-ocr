import { NextResponse } from "next/server";

/**
 * POST /api/documents/upload
 * Upload a document scan and trigger OCR processing.
 */
export async function POST() {
  // TODO: Implement file upload to storage + call OCR microservice (FIN-30)
  return NextResponse.json({ message: "POST /api/documents/upload - Not yet implemented" }, { status: 201 });
}
