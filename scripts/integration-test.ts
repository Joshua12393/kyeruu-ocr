/** Runs HTTP regression checks against a disposable database and the production build. */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import mariadb from "mariadb";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import { hashPassword } from "../src/lib/password";

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  const options = { host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), connectTimeout: 15000 };
  const name = `kyeruu_ocr_test_${randomBytes(6).toString("hex")}`;
  const uploads = path.resolve(".test-artifacts", name);
  const admin = await mariadb.createConnection(options);
  let prisma: PrismaClient | undefined;
  let server: ChildProcess | undefined;
  let log = "";
  try {
    await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    url.pathname = `/${name}`;
    const realOcr = process.env.INTEGRATION_OCR_SERVICE_URL;
    const env = { ...process.env, DATABASE_URL: url.toString(), FINANCE_CURRENT_TERM: "2026-2027", NEXTAUTH_SECRET: randomBytes(32).toString("hex"), UPLOAD_DIR: uploads, AWS_S3_BUCKET: "", OCR_SERVICE_URL: realOcr || "http://127.0.0.1:1" };
    const migration = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env, encoding: "utf8" });
    assert.equal(migration.status, 0, migration.stdout + migration.stderr);
    prisma = new PrismaClient({ adapter: new PrismaMariaDb({ ...options, database: name, connectionLimit: 3 }) });
    const password = "integration-test-password";
    const password_hash = await hashPassword(password);
    const treasurer = await prisma.user.create({ data: { name: "Test Treasurer", email: "treasurer@test.invalid", password_hash, role_type: "OFFICER", officer_terms: { create: { position: "TREASURER", term: "2026-2027" } } } });
    const president = await prisma.user.create({ data: { name: "Test President", email: "president@test.invalid", password_hash, role_type: "OFFICER", officer_terms: { create: { position: "PRESIDENT", term: "2026-2027" } } } });
    const administrator = await prisma.user.create({ data: { name: "Test Admin", email: "admin@test.invalid", password_hash, role_type: "ADMIN" } });
    const adviser = await prisma.user.create({ data: { name: "Test Adviser", email: "adviser@test.invalid", password_hash, role_type: "ADVISER", officer_terms: { create: { position: "ADVISER", term: "2026-2027" } } } });
    const auditor = await prisma.user.create({ data: { name: "Test Auditor", email: "auditor@test.invalid", password_hash, role_type: "OFFICER", officer_terms: { create: { position: "AUDITOR", term: "2026-2027" } } } });
    const assistant = await prisma.user.create({ data: { name: "Test Assistant", email: "assistant@test.invalid", password_hash, role_type: "OFFICER", officer_terms: { create: { position: "ASSISTANT_TREASURER", term: "2026-2027" } } } });
    const collector = await prisma.user.create({ data: { name: "Collection Officer", email: "collector@test.invalid", password_hash, role_type: "OFFICER", officer_terms: { create: { position: "OTHER", term: "2026-2027" } } } });
    const former = await prisma.user.create({ data: { name: "Former Treasurer", role_type: "OFFICER", officer_terms: { create: { position: "TREASURER", term: "2025-2026" } } } });
    const revoked = await prisma.user.create({ data: { name: "Revoked Officer", role_type: "OFFICER", officer_terms: { create: [{ position: "TREASURER", term: "2026-2027" }, { position: "OTHER", term: "2026-2027" }] } } });
    const port = await new Promise<number>(resolve => { const socket = createServer(); socket.listen(0, "127.0.0.1", () => { const address = socket.address(); assert(address && typeof address !== "string"); const port = address.port; socket.close(() => resolve(port)); }); });
    const base = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { env: { ...env, NEXTAUTH_URL: base }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    server.stdout?.on("data", chunk => { log += chunk; }); server.stderr?.on("data", chunk => { log += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error(log);
      try { if ((await fetch(`${base}/api/auth/providers`)).ok) break; } catch {}
      if (attempt === 99) throw new Error(`Server did not start: ${log}`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    const cookie = async (id: number, authVersion = 0) => `next-auth.session-token=${await encode({ secret: env.NEXTAUTH_SECRET, token: { userId: String(id), authVersion }, maxAge: 3600 })}`;
    const treasuryCookie = await cookie(treasurer.id), auditorCookie = await cookie(auditor.id);
    const signIn = async (email: string, attemptedPassword: string) => {
      const csrf = await fetch(`${base}/api/auth/csrf`);
      const csrfToken = (await csrf.json()).csrfToken;
      const cookies = csrf.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
      return fetch(`${base}/api/auth/callback/credentials`, {
        method: "POST", headers: { Cookie: cookies, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ csrfToken, email, password: attemptedPassword, callbackUrl: base, json: "true" }),
      });
    };
    const wrongPassword = await signIn(treasurer.email!, "wrong-password");
    assert.match((await wrongPassword.json()).url, /CredentialsSignin/);
    const nameSubstring = await signIn("Treasurer", password);
    assert.match((await nameSubstring.json()).url, /CredentialsSignin/);
    const correctPassword = await signIn(treasurer.email!, password);
    assert(correctPassword.headers.getSetCookie().some(value => value.startsWith("next-auth.session-token=")), "A valid exact-email/password pair must establish a session.");
    const request = async (route: string, status: number, session = treasuryCookie, method = "GET", body?: unknown) => {
      const response = await fetch(`${base}${route}`, { method, headers: { Origin: base, ...(session ? { Cookie: session } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const data = await response.json();
      assert.equal(response.status, status, `${method} ${route}: ${JSON.stringify(data)}\n${log}`);
      return data;
    };
    // Guard regressions: a response containing an error must stop all subsequent work.
    assert.equal((await fetch(`${base}/login`)).status, 200);
    assert.equal((await fetch(`${base}/register`)).status, 200);
    const signup = { name: "Pending Officer", email: "pending@test.invalid", password, confirmation: password };
    await request("/api/auth/register", 400, "", "POST", { ...signup, position: "PRESIDENT" });
    await request("/api/auth/register", 400, "", "POST", { ...signup, confirmation: "different-password" });
    const crossOriginSignup = await fetch(`${base}/api/auth/register`, { method: "POST", headers: { Origin: "https://other.invalid", "Content-Type": "application/json" }, body: JSON.stringify(signup) });
    assert.equal(crossOriginSignup.status, 403);
    await request("/api/auth/register", 201, "", "POST", signup);
    await request("/api/auth/register", 409, "", "POST", signup);
    const pending = await prisma.user.findUniqueOrThrow({ where: { email: signup.email }, include: { officer_terms: true } });
    assert.equal(pending.role_type, "STUDENT"); assert.equal(pending.officer_terms.length, 0);
    assert.notEqual(pending.password_hash, password);
    const pendingCookie = await cookie(pending.id), presidentCookie = await cookie(president.id), adminCookie = await cookie(administrator.id);
    const adviserCookie = await cookie(adviser.id), assistantCookie = await cookie(assistant.id);
    await request("/api/oms/terms", 403, treasuryCookie);
    await request("/api/schedules", 403, treasuryCookie, "POST", { schedule_number: "NO-CALENDAR", activity_type: "IGP", academic_year: "2026-2027", semester: "FIRST" });
    await request("/api/oms/terms", 400, adminCookie, "POST", { name: "2026-2027", starts_on: "2026-02-30", ends_on: "2027-01-01", make_current: true, version: 0 });
    await request("/api/oms/terms", 400, adminCookie, "POST", { name: "2026-2027", starts_on: "2027-01-01", ends_on: "2026-01-01", make_current: true, version: 0 });
    await request("/api/oms/terms", 200, adminCookie, "POST", { name: "2026-2027", starts_on: "2026-01-01", ends_on: "2027-12-31", make_current: true, version: 0 });
    await request("/api/oms/terms", 409, adminCookie, "POST", { name: "2026-2027", starts_on: null, ends_on: null, make_current: true, version: 0 });
    assert((await signIn(signup.email, password)).headers.getSetCookie().some(value => value.startsWith("next-auth.session-token=")));
    await request("/api/schedules", 401, pendingCookie);
    assert.equal((await fetch(`${base}/`, { headers: { Cookie: pendingCookie }, redirect: "manual" })).headers.get("location"), "/access-pending");
    await request("/api/accounts", 401, ""); await request("/api/accounts", 403, treasuryCookie);
    await request("/api/accounts", 401, pendingCookie, "PATCH", { action: "role", user_id: pending.id, role: "ADMIN" });
    await request("/api/accounts", 403, presidentCookie);
    await request("/api/accounts", 403, await cookie(adviser.id));
    await request("/api/accounts", 403, presidentCookie, "PATCH", { action: "role", user_id: pending.id, role: "ADMIN" });
    await request("/api/accounts", 403, adminCookie, "PATCH", { action: "role", user_id: administrator.id, role: "TREASURER" });
    await request("/api/accounts", 403, adminCookie, "PATCH", { action: "status", user_id: administrator.id, is_active: false });
    await request("/api/accounts", 403, adminCookie, "DELETE", { user_id: administrator.id });
    await request("/api/schedules", 403, adminCookie);
    assert.equal((await fetch(`${base}/`, { headers: { Cookie: adminCookie }, redirect: "manual" })).headers.get("location"), "/accounts");
    const accounts = await request("/api/accounts", 200, adminCookie);
    assert(accounts.users.every((user: Record<string, unknown>) => !("password_hash" in user)));
    await request("/api/accounts", 200, adminCookie, "PATCH", { action: "role", user_id: pending.id, role: "AUDITOR" });
    await request("/api/schedules", 200, pendingCookie);
    await request("/api/schedules", 403, pendingCookie, "POST", {});
    await request("/api/accounts", 201, adminCookie, "POST", { name: "Created Officer", email: "created@test.invalid", password, confirmation: password, role: "TREASURER" });
    await request("/api/accounts", 409, adminCookie, "POST", { name: "Created Officer", email: "created@test.invalid", password, confirmation: password, role: "TREASURER" });
    const created = await prisma.user.findUniqueOrThrow({ where: { email: "created@test.invalid" }, include: { officer_terms: true } });
    assert.equal(created.officer_terms[0].position, "TREASURER"); assert.equal(created.officer_terms[0].term, "2026-2027");
    const createdCookie = await cookie(created.id);
    await request("/api/schedules", 200, createdCookie);
    await request("/api/accounts", 200, adminCookie, "PATCH", { action: "status", user_id: created.id, is_active: false });
    await request("/api/schedules", 401, createdCookie);
    assert.match((await (await signIn(created.email!, password)).json()).url, /CredentialsSignin/);
    assert.equal((await fetch(`${base}/login`, { headers: { Cookie: createdCookie }, redirect: "manual" })).status, 200);
    await request("/api/accounts", 200, adminCookie, "PATCH", { action: "status", user_id: created.id, is_active: true });
    await request("/api/schedules", 401, createdCookie);
    assert((await signIn(created.email!, password)).headers.getSetCookie().some(value => value.startsWith("next-auth.session-token=")));
    await request("/api/schedules", 200, await cookie(created.id, 2));
    await request("/api/accounts", 200, adminCookie, "PATCH", { action: "role", user_id: pending.id, role: "ADMIN" });
    await request("/api/accounts", 200, pendingCookie);
    await request("/api/accounts", 200, adminCookie, "PATCH", { action: "role", user_id: pending.id, role: "PENDING" });
    await request("/api/accounts", 401, pendingCookie);
    await request("/api/schedules", 401, pendingCookie);
    await request("/api/accounts", 200, adminCookie, "DELETE", { user_id: created.id });
    const deleted = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
    assert(deleted.deleted_at); assert.equal(deleted.email, null); assert.equal(deleted.password_hash, null);
    assert.equal((await request("/api/accounts", 200, adminCookie)).users.some((user: { id: number }) => user.id === created.id), false);
    await request("/api/schedules", 401, await cookie(created.id, 2));
    await request("/api/accounts", 404, adminCookie, "PATCH", { action: "status", user_id: created.id, is_active: true });
    assert.match((await (await signIn("created@test.invalid", password)).json()).url, /CredentialsSignin/);
    await request("/api/transactions/vouchers", 401, "");
    await request("/api/schedules", 401, "", "POST", {});
    await request("/api/schedules", 401, await cookie(former.id));
    await request("/api/schedules", 401, await cookie(revoked.id));
    await request("/api/schedules", 403, auditorCookie, "POST", {});
    const page = await fetch(`${base}/ocr`, { redirect: "manual" });
    assert.equal(page.status, 307, "Unauthenticated pages must redirect to sign-in.");
    const users = await request("/api/users", 200);
    assert(users.every((user: Record<string, unknown>) => !('password_hash' in user) && !('email' in user)));
    const group = await request("/api/schedules", 201, treasuryCookie, "POST", { schedule_number: "TEST-01", activity_type: "IGP", academic_year: "2026-2027", semester: "FIRST" });
    const outflow = group.schedules.find((s: { type: string }) => s.type === "OUTFLOW");
    const inflow = group.schedules.find((s: { type: string }) => s.type === "INFLOW");
    const input = { control_number: "DV-001", date: "2026-10-03", purpose: "Test supplies", amount: "100.00", released_to_id: String(treasurer.id), schedule_id: String(outflow.id), form_of_payment: "CASH" };
    // Phase 1: all five roles can read; only four can edit, only Auditor verifies.
    for (const roleCookie of [treasuryCookie, assistantCookie, presidentCookie, adviserCookie, auditorCookie]) {
      await request("/api/schedules", 200, roleCookie);
      await request("/api/verification", 200, roleCookie);
      assert.equal((await fetch(`${base}/schedules`, { headers: { Cookie: roleCookie } })).status, 200);
    }
    await request("/api/schedules", 401, await cookie(collector.id));
    for (const [role, roleCookie] of [["ASSISTANT", assistantCookie], ["PRESIDENT", presidentCookie], ["ADVISER", adviserCookie]] as const) {
      const roleVoucher = await request("/api/transactions/vouchers", 201, roleCookie, "POST", { ...input, control_number: `DV-${role}` });
      await request(`/api/transactions/vouchers/${roleVoucher.id}`, 200, roleCookie, "PATCH", { ...input, control_number: `DV-${role}`, purpose: "Role edit", version: 1 });
      await request("/api/verification/toggle", 403, roleCookie, "POST", { transaction_id: roleVoucher.id, type: "DV", status: true, version: 2 });
      await request(`/api/transactions/vouchers/${roleVoucher.id}`, 403, roleCookie, "DELETE", { version: 2 });
      await request(`/api/transactions/vouchers/${roleVoucher.id}`, 200, treasuryCookie, "DELETE", { version: 2 });
    }
    for (const activity_type of ["MEMBERSHIP", "FINES"] as const) {
      const oneSide = await request("/api/schedules", 201, presidentCookie, "POST", { schedule_number: `DEFAULT-${activity_type}`, activity_type, academic_year: "2026-2027", semester: "FIRST" });
      assert.deepEqual(oneSide.schedules.map((side: { type: string }) => side.type), ["INFLOW"]);
      const expanded = await request(`/api/schedules/${oneSide.id}`, 200, adviserCookie, "PATCH", { sides: [...oneSide.schedules.map((side: { id: number; type: string; label: string }) => ({ id: side.id, type: side.type, label: side.label })), { type: "OUTFLOW", label: "Optional expenses" }] });
      assert.equal(expanded.schedules.length, 2);
      await request(`/api/schedules/${oneSide.id}`, 400, treasuryCookie, "PATCH", { sides: [{ type: "INFLOW", label: "A" }, { type: "INFLOW", label: "B" }] });
      await request(`/api/schedules/${oneSide.id}`, 200, treasuryCookie, "PATCH", { sides: [{ id: oneSide.schedules[0].id, type: "OUTFLOW", label: "Unused side changed" }] });
      await request(`/api/schedules/${oneSide.id}`, 200, treasuryCookie, "DELETE");
    }
    await request("/api/schedules", 403, treasuryCookie, "POST", { schedule_number: "PAST", activity_type: "IGP", academic_year: "2025-2026", semester: "FIRST" });
    const raceGroup = await request("/api/schedules", 201, treasuryCookie, "POST", { schedule_number: "SIDE-RACE", activity_type: "IGP", academic_year: "2026-2027", semester: "FIRST", sides: [{ type: "OUTFLOW", label: "Race expenses" }] });
    const raceSide = raceGroup.schedules[0];
    const raceResponses = await Promise.all([
      fetch(`${base}/api/transactions/vouchers`, { method: "POST", headers: { Cookie: treasuryCookie, Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ ...input, schedule_id: raceSide.id, control_number: "DV-SIDE-RACE" }) }),
      fetch(`${base}/api/schedules/${raceGroup.id}`, { method: "PATCH", headers: { Cookie: treasuryCookie, Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ sides: [{ id: raceSide.id, type: "INFLOW", label: "Race collections" }] }) }),
    ]);
    const raceStatuses = raceResponses.map(response => response.status);
    assert(raceStatuses[0] === 201 ? raceStatuses[1] === 409 : [400, 409].includes(raceStatuses[0]) && raceStatuses[1] === 200, `Side mutation/create race: ${raceStatuses}`);
    const raceVoucher = await prisma.disbursementVoucher.findUnique({ where: { control_number: "DV-SIDE-RACE" }, include: { schedule: true } });
    if (raceVoucher) {
      assert.equal(raceVoucher.schedule.type, "OUTFLOW");
      await request(`/api/transactions/vouchers/${raceVoucher.id}`, 200, treasuryCookie, "DELETE", { version: raceVoucher.version });
    }
    await request(`/api/schedules/${raceGroup.id}`, 200, treasuryCookie, "DELETE");
    await request("/api/transactions/vouchers", 403, auditorCookie, "POST", input);
    await request("/api/transactions/vouchers", 400, treasuryCookie, "POST", { ...input, schedule_id: inflow.id });
    const voucher = await request("/api/transactions/vouchers", 201, treasuryCookie, "POST", input);
    await request("/api/transactions/vouchers", 409, treasuryCookie, "POST", input);
    const receipt = await request("/api/transactions/receipts", 201, treasuryCookie, "POST", { control_number: "AR-001", date: "2026-10-03", purpose: "Collections", amount: "100.00", remitted_by_id: String(treasurer.id), schedule_id: String(inflow.id), form_of_payment: "CASH" });
    const firstFlags = await request("/api/reconciliation", 200);
    assert.equal(firstFlags.summary.total_incomplete, 2);
    await request("/api/verification/toggle", 403, treasuryCookie, "POST", { transaction_id: voucher.id, type: "DV", status: true, version: 1 });
    await request("/api/verification/toggle", 200, auditorCookie, "POST", { transaction_id: voucher.id, type: "DV", status: true, version: 1 });
    await request(`/api/transactions/vouchers/${voucher.id}`, 409, treasuryCookie, "PATCH", { ...input, version: 1 });
    const edited = await request(`/api/transactions/vouchers/${voucher.id}`, 200, treasuryCookie, "PATCH", { ...input, purpose: "Updated purpose", version: 2 });
    assert.equal(edited.is_verified, false);
    const events = await prisma.verificationEvent.findMany({ where: { dv_id: voucher.id }, orderBy: { id: "asc" } });
    assert.deepEqual(events.map(event => event.event), ["VERIFIED", "CLEARED_BY_EDIT"]);
    assert.equal(events[0].user_id, auditor.id);
    // Upload storage, failed extraction, and successful manual entry are distinct states.
    const png = realOcr ? await readFile(".test-artifacts/ocr-smoke.png") : Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf5kAAAAASUVORK5CYII=", "base64");
    const upload = async (pipeline: string, expected: number) => {
      const form = new FormData(); form.append("file", new Blob([png], { type: "image/png" }), "scan.png"); form.append("pipeline", pipeline);
      const response = await fetch(`${base}/api/ocr/process`, { method: "POST", headers: { Cookie: treasuryCookie }, body: form });
      const data = await response.json(); assert.equal(response.status, expected, JSON.stringify(data)); return data.scanId as number;
    };
    const scanId = await upload(realOcr ? "manual" : "printed", realOcr ? 201 : 503);
    assert.equal((await prisma.documentScan.findUniqueOrThrow({ where: { id: scanId } })).ocr_status, realOcr ? "MANUAL" : "FAILED");
    if (realOcr) {
      const processedId = await upload("printed", 200);
      const processed = await prisma.documentScan.findUniqueOrThrow({ where: { id: processedId } });
      assert.equal(processed.ocr_status, "PROCESSED");
      assert.equal(JSON.parse(processed.ocr_raw_text!).fields.find((field: { field_name: string }) => field.field_name === "amount").value, "150.00");
      console.log("Next.js -> Python -> PaddleOCR -> saved structured result passed.");
    }
    assert.equal((await fetch(`${base}/api/storage?scanId=${scanId}`)).status, 401);
    const scanResponse = await fetch(`${base}/api/storage?scanId=${scanId}`, { headers: { Cookie: treasuryCookie } });
    assert.equal(scanResponse.status, 200); assert.deepEqual(Buffer.from(await scanResponse.arrayBuffer()), png);
    const receiptScan = await upload("manual", 201);
    await request("/api/documents/supporting", 201, treasuryCookie, "POST", { kind: "RECEIPT", scan_id: receiptScan, internal_receipt_number: "R-001", reference_number: "SHOP-001", date: "2026-10-03", doc_type: "RETAILER_RECEIPT", particulars: [{ particular_name: "Paper", quantity: "2", unit_cost: "50.00", schedule_id: outflow.id, link: { transaction_id: voucher.id, version: 3 } }] });
    const sheetScan = await upload("manual", 201);
    await request("/api/documents/supporting", 400, treasuryCookie, "POST", { kind: "SHEET", scan_id: sheetScan, doc_type: "COLLECTION_SHEET", context_label: "Fees", total_amount: "100.00", links: [{ transaction_id: receipt.id, version: 1, amount_covered: "100.01" }] });
    await request("/api/documents/supporting", 201, treasuryCookie, "POST", { kind: "SHEET", scan_id: sheetScan, doc_type: "COLLECTION_SHEET", context_label: "Fees", total_amount: "100.00", links: [{ transaction_id: receipt.id, version: 1, amount_covered: "100.00" }] });
    const finalFlags = await request("/api/reconciliation", 200);
    assert.equal(finalFlags.summary.total_incomplete, 0); assert.equal(finalFlags.summary.total_mismatches, 0);
    await request(`/api/schedules/${group.id}`, 200, presidentCookie, "PATCH", { schedule_number: "RENAMED", activity_type: "EVENTS", sides: group.schedules.map((side: { id: number; type: string; label: string }) => ({ id: side.id, type: side.type, label: `Renamed ${side.label}` })) });
    assert.equal((await prisma.disbursementVoucher.findUniqueOrThrow({ where: { id: voucher.id } })).schedule_id, outflow.id);
    assert.equal((await prisma.acknowledgementReceipt.findUniqueOrThrow({ where: { id: receipt.id } })).schedule_id, inflow.id);
    assert.equal((await prisma.receiptParticular.findFirstOrThrow({ where: { dv_id: voucher.id } })).schedule_id, outflow.id);
    await request(`/api/schedules/${group.id}`, 409, treasuryCookie, "PATCH", { sides: [{ id: inflow.id, type: "INFLOW", label: "Only inflow" }] });
    await request(`/api/schedules/${group.id}`, 409, treasuryCookie, "PATCH", { sides: [{ id: outflow.id, type: "INFLOW", label: "Wrong direction" }] });
    await request(`/api/schedules/${group.id}`, 409, treasuryCookie, "PATCH", { semester: "SECOND" });
    await request(`/api/schedules/${group.id}`, 400, treasuryCookie, "PATCH", { sides: [{ id: 999999, type: "INFLOW", label: "Foreign side" }] });
    await request("/api/term", 200, treasuryCookie, "POST", { groupId: group.id });
    await request("/api/transactions/vouchers", 403, treasuryCookie, "POST", { ...input, control_number: "DV-CLOSED" });
    await request(`/api/transactions/vouchers/${voucher.id}`, 403, treasuryCookie, "PATCH", { ...input, version: 4 });
    await request("/api/documents/orphan/link", 403, treasuryCookie, "POST", { scan_id: scanId, transaction_type: "DV", transaction_id: voucher.id, version: 4 });
    await request("/api/verification/toggle", 403, auditorCookie, "POST", { transaction_id: voucher.id, type: "DV", status: true, version: 4 });
    await request(`/api/schedules/${group.id}`, 403, adviserCookie, "PATCH", { schedule_number: "CLOSED-RENAME" });
    const emptyGroup = await request("/api/schedules", 201, treasuryCookie, "POST", { schedule_number: "EMPTY", activity_type: "EVENTS", academic_year: "2026-2027", semester: "SECOND" });
    await request(`/api/schedules/${emptyGroup.id}`, 200, treasuryCookie, "DELETE");
    const pastGroup = await prisma.scheduleGroup.create({ data: { schedule_number: "HISTORY", academic_year: "2025-2026", activity_type: "FINES", semester: "FIRST", schedules: { create: { type: "INFLOW", label: "Historical collections" } } } });
    assert((await request("/api/schedules", 200)).some((row: { id: number }) => row.id === pastGroup.id));
    await request(`/api/schedules/${pastGroup.id}`, 403, treasuryCookie, "PATCH", { schedule_number: "DO-NOT-CHANGE" });
    const future = await request("/api/oms/terms", 200, adminCookie);
    await request("/api/oms/terms", 200, adminCookie, "POST", { name: "2026-2027", starts_on: "2027-01-01", ends_on: "2027-12-31", make_current: true, version: future.version });
    await request("/api/schedules", 200, treasuryCookie);
    await request("/api/schedules", 403, treasuryCookie, "POST", { schedule_number: "FUTURE", activity_type: "IGP", academic_year: "2026-2027", semester: "FIRST" });
    const expired = await request("/api/oms/terms", 200, adminCookie);
    await request("/api/oms/terms", 200, adminCookie, "POST", { name: "2026-2027", starts_on: "2026-01-01", ends_on: "2026-02-01", make_current: true, version: expired.version });
    await request("/api/schedules", 403, presidentCookie, "POST", { schedule_number: "EXPIRED", activity_type: "IGP", academic_year: "2026-2027", semester: "FIRST" });
    const turnover = await request("/api/oms/terms", 200, adminCookie);
    await request("/api/oms/terms", 200, adminCookie, "POST", { name: "2027-2028", starts_on: null, ends_on: null, make_current: true, version: turnover.version });
    await request("/api/schedules", 401, treasuryCookie);
    await request("/api/accounts", 200, adminCookie);
    await request("/api/accounts", 200, adminCookie, "PATCH", { action: "role", user_id: treasurer.id, role: "TREASURER" });
    await request("/api/schedules", 200, treasuryCookie);
    assert.equal((await prisma.officerTerm.findFirstOrThrow({ where: { user_id: treasurer.id }, orderBy: { id: "desc" } })).term, "2027-2028");
    await request("/api/accounts", 200, adminCookie, "DELETE", { user_id: auditor.id });
    const retainedEvent = await prisma.verificationEvent.findFirstOrThrow({ where: { dv_id: voucher.id, event: "VERIFIED" }, include: { user: true } });
    assert.equal(retainedEvent.user.id, auditor.id); assert(retainedEvent.user.deleted_at);
    assert.equal(await prisma.disbursementVoucher.count({ where: { id: voucher.id } }), 1);
    console.log("Integration checks passed: Phase 1 five-role journeys, collection-officer exclusion, OMS calendars/turnover, defaults/custom sides, safe renames with preserved links, used/closed/historical side protections, side mutation/create race, plus existing account, transaction, audit, storage, OCR fallback, support, reconciliation and closure regressions.");
  } catch (error) {
    console.error("Integration failure:", error, log);
    throw error;
  } finally {
    if (server && server.exitCode === null) { server.kill(); await new Promise(resolve => server!.once("exit", resolve)); }
    await prisma?.$disconnect();
    assert(/^kyeruu_ocr_test_[a-f0-9]{12}$/.test(name));
    await admin.end().catch(() => {});
    const cleanup = await mariadb.createConnection(options);
    await cleanup.query(`DROP DATABASE IF EXISTS \`${name}\``); await cleanup.end();
    const testRoot = path.resolve(".test-artifacts") + path.sep;
    assert(uploads.startsWith(testRoot));
    await rm(uploads, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
