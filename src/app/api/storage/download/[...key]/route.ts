import { downloadScan } from "@/lib/scan-response";
export async function GET(req: Request, context: { params: Promise<{ key: string[] }> }) {
  return downloadScan(req, (await context.params).key.join("/"));
}
