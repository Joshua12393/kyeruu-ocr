import assert from "node:assert/strict";
import { test } from "node:test";
import { transactionInput, date, money } from "../src/lib/validation";
import { itemGross, supportingInput } from "../src/lib/supporting-validation";
test("New controls allow separated letters and digits without silently changing values", () => {
  for (const value of ["AR-2026-001", "DV/26/1", "old123", "Ar-2026/1"]) assert.equal(transactionInput.shape.control_number.parse(value), value);
  for (const value of ["", "AR 1", "AR--1", "AR/", "-AR", "AR_1"]) assert.equal(transactionInput.shape.control_number.safeParse(value).success, false);
});
test("Real dates and exact decimal bounds reject coerced or overflowing amounts", () => {
  assert.equal(date.safeParse("2026-02-29").success, false); assert.equal(date.parse("2028-02-29"), "2028-02-29");
  for (const value of ["0", "-1", "1.001", "1e3", "10000000000.00"]) assert.equal(money.safeParse(value).success, false);
});
test("Receipt item amounts use cent rounding without floating-point drift", () => {
  assert.equal(itemGross("0.15", "0.10").toFixed(2), "0.02"); assert.equal(itemGross("3", "0.10").toFixed(2), "0.30");
  assert.throws(() => itemGross("0.01", "0.01")); assert.throws(() => itemGross("99999999.99", "9999999999.99"));
});
test("Support saves accept stable item IDs and require well-formed optimistic versions", () => {
  const sheet = { kind: "SHEET", scan_id: 1, doc_type: "COLLECTION_SHEET", context_label: "Fees", total_amount: "1.00", links: [] };
  assert(supportingInput.safeParse(sheet).success); assert.equal(supportingInput.safeParse({ ...sheet, version: 0 }).success, false);
  assert.equal(supportingInput.safeParse({ ...sheet, links: [{ transaction_id: 1, amount_covered: "1" }] }).success, false);
});
