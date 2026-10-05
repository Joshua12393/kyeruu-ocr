import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
export async function GET() {
  try { await prisma.$queryRaw`SELECT 1`; return NextResponse.json({ status: "ready", database: "reachable", service: "kyeruu-finance", ocr: "optional-for-manual-entry" }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ status: "unavailable", database: "unreachable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
