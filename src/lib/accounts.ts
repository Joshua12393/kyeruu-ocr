import { z } from "zod";
import { ApiError } from "./api";
import { applicationOrigin } from "./request-origin";
export const accountInput = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.email().max(255).transform(value => value.trim().toLowerCase()),
  password: z.string().min(12, "Use at least 12 characters.").max(256),
  confirmation: z.string().max(256),
}).strict().refine(value => value.password === value.confirmation, { message: "Passwords do not match.", path: ["confirmation"] });
export const officerPosition = z.enum(["ADVISER", "PRESIDENT", "TREASURER", "ASSISTANT_TREASURER", "AUDITOR"]);
export const officerAccountInput = accountInput.safeExtend({ position: officerPosition });
export const accountRole = z.enum(["ADMIN", "ADVISER", "PRESIDENT", "TREASURER", "ASSISTANT_TREASURER", "AUDITOR", "PENDING"]);
export const adminAccountInput = accountInput.safeExtend({ role: accountRole });
export const accountChangeInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("role"), user_id: z.number().int().positive(), role: accountRole }).strict(),
  z.object({ action: z.literal("status"), user_id: z.number().int().positive(), is_active: z.boolean() }).strict(),
]);
export const accountDeleteInput = z.object({ user_id: z.number().int().positive() }).strict();
export const assignmentInput = z.object({ user_id: z.number().int().positive(), position: officerPosition }).strict();
export function requireSameOrigin(req: Request) {
  if (req.headers.get("origin") !== applicationOrigin(req)) throw new ApiError(403, "Please submit this form from the finance website.");
}
export async function readAccountBody(req: Request) {
  const text = await req.text();
  if (text.length > 4096) throw new ApiError(413, "This form is too large.");
  return JSON.parse(text);
}
