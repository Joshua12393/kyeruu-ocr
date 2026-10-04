import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { accountInput, readAccountBody, requireSameOrigin } from "@/lib/accounts";
import { apiError } from "@/lib/api";
// A bounded per-process burst guard; deployment-wide throttling belongs at the proxy.
let windowStart = 0, attempts = 0;
export async function POST(req: Request) {
  try {
    requireSameOrigin(req);
    if (Date.now() - windowStart > 60000) { windowStart = Date.now(); attempts = 0; }
    if (++attempts > 10) return NextResponse.json({ error: "Too many account requests. Try again in a minute." }, { status: 429, headers: { "Retry-After": "60" } });
    const input = accountInput.parse(await readAccountBody(req));
    const password_hash = await hashPassword(input.password);
    await prisma.user.create({ data: { name: input.name, email: input.email, password_hash, role_type: "STUDENT" } });
    return NextResponse.json({ message: "Account created. Sign in to check your access status." }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "An account with this email already exists. Sign in instead." }, { status: 409 });
    return apiError(error);
  }
}
