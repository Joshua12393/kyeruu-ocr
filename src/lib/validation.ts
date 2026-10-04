import { z } from "zod";
export const positiveId = z.coerce.number().int().positive().max(2147483647);
export const money = z.union([z.string(), z.number()]).transform(String)
  .refine(value => /^\d{1,10}(\.\d{1,2})?$/.test(value) && Number(value) > 0, "Amount must be positive with at most two decimal places.");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Invalid date.");
export const transactionInput = z.object({
  control_number: z.string().trim().min(1).max(50), date,
  purpose: z.string().trim().min(1).max(500), amount: money,
  schedule_id: positiveId, form_of_payment: z.enum(["CASH", "E_WALLET"]),
  scan_file_id: positiveId.nullable().optional(),
});
export const voucherInput = transactionInput.extend({ released_to_id: positiveId });
export const receiptInput = transactionInput.extend({ remitted_by_id: positiveId });
export const groupInput = z.object({
  schedule_number: z.string().trim().min(1).max(50),
  activity_type: z.enum(["IGP", "MEMBERSHIP", "FINES", "EVENTS"]),
  academic_year: z.string().trim().min(1).max(20), semester: z.enum(["FIRST", "SECOND", "SUMMER"]),
}).strict();
export const scheduleSideInput = z.object({ id: positiveId.optional(), type: z.enum(["INFLOW", "OUTFLOW"]), label: z.string().trim().min(1).max(255) }).strict();
export const scheduleSides = z.array(scheduleSideInput).min(1).max(2).refine(sides => new Set(sides.map(side => side.type)).size === sides.length, "Each direction can appear only once.");
export const createGroupInput = groupInput.extend({ sides: scheduleSides.optional() });
export const updateGroupInput = groupInput.partial().extend({ sides: scheduleSides.optional() }).strict().refine(input => Object.keys(input).length > 0, "Provide a metadata or side change.");
