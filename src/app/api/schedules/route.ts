import { NextResponse } from "next/server";

/**
 * GET /api/schedules
 * List all schedule groups with their inflow/outflow schedules.
 */
export async function GET() {
  // TODO: Implement with Prisma query
  return NextResponse.json({ message: "GET /api/schedules - Not yet implemented" });
}

/**
 * POST /api/schedules
 * Create a new schedule group and auto-generate inflow/outflow sides.
 */
export async function POST() {
  // TODO: Implement schedule group creation (FIN-23)
  return NextResponse.json({ message: "POST /api/schedules - Not yet implemented" }, { status: 201 });
}
