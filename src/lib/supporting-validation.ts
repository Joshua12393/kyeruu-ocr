import { Prisma } from "@prisma/client";
import { z } from "zod";
import { money, positiveId, date } from "./validation";
export const parentVersion = z.object({ type: z.enum(["DV", "AR"]), id: positiveId, version: positiveId }).strict();
const versionedLink = z.object({ transaction_id: positiveId, version: positiveId }).strict();
export const itemInput = z.object({ id: positiveId.optional(), particular_name: z.string().trim().min(1).max(255), quantity: money.refine(value => new Prisma.Decimal(value).lessThan("100000000"), "Quantity exceeds the allowed precision."), unit_cost: money, schedule_id: positiveId, link: versionedLink.optional() }).strict();
export const receiptSupportInput = z.object({ kind: z.literal("RECEIPT"), scan_id: positiveId, internal_receipt_number: z.string().trim().min(1).max(50), reference_number: z.string().trim().min(1).max(100), date, doc_type: z.enum(["RETAILER_RECEIPT", "CERTIFICATE_OF_EXPENSES"]), particulars: z.array(itemInput).min(1).max(200), version: positiveId.optional(), parent_versions: z.array(parentVersion).max(400).optional() }).strict();
export const sheetSupportInput = z.object({ kind: z.literal("SHEET"), scan_id: positiveId, doc_type: z.enum(["COLLECTION_SHEET", "SALES_SHEET"]), context_label: z.string().trim().min(1).max(255), period_covered: z.string().trim().max(100).optional(), total_amount: money, links: z.array(versionedLink.extend({ amount_covered: money })).max(200), version: positiveId.optional(), parent_versions: z.array(parentVersion).max(400).optional() }).strict();
export const supportingInput = z.discriminatedUnion("kind", [receiptSupportInput, sheetSupportInput]);
export type SupportingInput = z.infer<typeof supportingInput>;
export function itemGross(quantity: string, unitCost: string) {
  const gross = new Prisma.Decimal(quantity).times(unitCost).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (gross.lessThanOrEqualTo(0) || gross.greaterThan("9999999999.99")) throw new Error("Rounded item amount must be positive and fit the allowed amount range.");
  return gross;
}
