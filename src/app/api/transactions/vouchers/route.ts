import { NextResponse } from "next/server";

/**
 * GET /api/transactions/vouchers
 * List disbursement vouchers with optional filters.
 */
export async function GET() {
  // TODO: Implement with Prisma query (FIN-01)
  return NextResponse.json({ message: "GET /api/transactions/vouchers - Not yet implemented" });
}

/**
 * POST /api/transactions/vouchers
 * Create a new disbursement voucher (outflow).
 */
export async function POST() {
  // TODO: Implement DV creation with duplicate control number check (FIN-32)
  return NextResponse.json({ message: "POST /api/transactions/vouchers - Not yet implemented" }, { status: 201 });
}
