import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/lib/password";
import { voucherInput } from "../src/lib/validation";
import { validateImage, MAX_UPLOAD_BYTES } from "../src/lib/storage";

test("password verification rejects wrong, missing, and malformed credentials", async () => {
  const hash = await hashPassword("example-password-2026");
  assert.equal(await verifyPassword("example-password-2026", hash), true);
  assert.equal(await verifyPassword("another-password", hash), false);
  assert.equal(await verifyPassword("anything", null), false);
  assert.equal(await verifyPassword("anything", "scrypt:broken:hash"), false);
  assert.notEqual(await hashPassword("example-password-2026"), hash);
});

const valid = { control_number: "DV-001", date: "2026-10-03", purpose: "Supplies", amount: "12.30", released_to_id: "1", schedule_id: "2", form_of_payment: "CASH" };
test("financial validation converts form IDs and preserves decimal strings", () => {
  const input = voucherInput.parse(valid);
  assert.equal(input.released_to_id, 1);
  assert.equal(input.schedule_id, 2);
  assert.equal(input.amount, "12.30");
});
test("financial validation rejects invalid calendar dates, negative amounts, extra decimals and invalid IDs", () => {
  for (const overrides of [{ date: "2026-02-30" }, { amount: "-1.00" }, { amount: "12.345" }, { amount: "3.00junk" }, { amount: "Infinity" }, { schedule_id: "" }, { released_to_id: "1.1" }]) {
    assert.equal(voucherInput.safeParse({ ...valid, ...overrides }).success, false);
  }
});
test("uploads reject fake image MIME types and oversized images", async () => {
  await assert.rejects(validateImage(new File(["not an image"], "fake.png", { type: "image/png" })));
  await assert.rejects(validateImage(new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "large.png", { type: "image/png" })));
  await assert.rejects(validateImage("not a file"));
});
