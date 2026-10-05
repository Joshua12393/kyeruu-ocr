import { listSupporting, writeSupporting } from "@/lib/supporting";
export const GET = listSupporting;
export async function POST(req: Request) { return writeSupporting(req); }
