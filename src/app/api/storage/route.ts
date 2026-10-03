import { downloadScan } from "@/lib/scan-response";
export async function GET(req: Request) { return downloadScan(req); }
export { processOcr as POST } from "@/lib/ocr";
