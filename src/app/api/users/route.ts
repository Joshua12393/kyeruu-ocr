import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireFinanceAccess } from "@/lib/auth";
import { apiError } from "@/lib/api";
export async function GET(req: Request) {
  try {
    const guard = await requireFinanceAccess(req);
    if (guard instanceof NextResponse) return guard;
    return NextResponse.json(await prisma.user.findMany({ select: { id: true, name: true, role_type: true }, orderBy: { name: "asc" } }));
  } catch (error) { return apiError(error); }
}
