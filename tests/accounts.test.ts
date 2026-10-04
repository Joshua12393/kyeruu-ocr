import { test } from "node:test";
import assert from "node:assert/strict";
import { accountInput, officerAccountInput, adminAccountInput, accountChangeInput, requireSameOrigin } from "../src/lib/accounts";
import { safeCallback } from "../src/lib/auth-redirect";
const input = { name: "New Officer", email: "OFFICER@example.com", password: "secure-password-example", confirmation: "secure-password-example" };
test("form origin uses the public URL even when the internal hostname differs", () => {
  const previous = process.env.NEXTAUTH_URL;
  process.env.NEXTAUTH_URL = "http://127.0.0.1:57063";
  try {
    assert.doesNotThrow(() => requireSameOrigin(new Request("http://localhost:57063/api/auth/register", { headers: { Origin: "http://127.0.0.1:57063" } })));
    assert.throws(() => requireSameOrigin(new Request("http://localhost:57063/api/auth/register", { headers: { Origin: "https://other.invalid" } })));
    assert.throws(() => requireSameOrigin(new Request("http://localhost:57063/api/auth/register")));
  } finally { if (previous === undefined) delete process.env.NEXTAUTH_URL; else process.env.NEXTAUTH_URL = previous; }
});
test("public account input normalizes email and rejects finance privilege fields", () => {
  assert.equal(accountInput.parse(input).email, "officer@example.com");
  assert.equal(accountInput.safeParse({ ...input, position: "PRESIDENT" }).success, false);
  assert.equal(accountInput.safeParse({ ...input, term: "2026-2027" }).success, false);
  assert.equal(accountInput.safeParse({ ...input, role_type: "OFFICER" }).success, false);
  assert.equal(accountInput.safeParse({ ...input, role: "ADMIN" }).success, false);
  assert.equal(accountInput.safeParse({ ...input, is_active: true }).success, false);
});
test("admin account changes validate roles and actual boolean status values", () => {
  assert.equal(adminAccountInput.safeParse({ ...input, role: "ADMIN" }).success, true);
  assert.equal(adminAccountInput.safeParse({ ...input, role: "ADMIN", confirmation: "different" }).success, false);
  assert.equal(accountChangeInput.safeParse({ action: "status", user_id: 1, is_active: false }).success, true);
  assert.equal(accountChangeInput.safeParse({ action: "status", user_id: 1, is_active: "false" }).success, false);
  assert.equal(accountChangeInput.safeParse({ action: "role", user_id: 1, role: "INVALID" }).success, false);
});
test("officer creation preserves matching-password and role validation", () => {
  assert.equal(officerAccountInput.safeParse({ ...input, position: "TREASURER" }).success, true);
  assert.equal(officerAccountInput.safeParse({ ...input, position: "TREASURER", confirmation: "different-password" }).success, false);
  assert.equal(accountInput.safeParse({ ...input, password: "short", confirmation: "short" }).success, false);
  assert.equal(officerAccountInput.safeParse({ ...input, position: "OTHER" }).success, false);
});
test("sign-in destinations cannot leave the site or loop into authentication", () => {
  for (const value of [null, "https://evil.example", "//evil.example", "/\\evil.example", "/login", "/register", "/api/auth/signin", "/access-pending"]) assert.equal(safeCallback(value), "/");
  assert.equal(safeCallback("/ocr?view=review"), "/ocr?view=review");
});
