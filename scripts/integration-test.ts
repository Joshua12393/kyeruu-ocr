/** Runs HTTP regression checks against a disposable database and the production build. */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttpServer, type Server } from "node:http";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import mariadb from "mariadb";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import { hashPassword } from "../src/lib/password";
import { validateArchive, type FinanceArchive } from "../src/lib/archive-format";
import { restoreAndVerify } from "../src/lib/archive-restore";

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  const options = { host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), connectTimeout: 15000 };
  const name = `kyeruu_ocr_test_${randomBytes(6).toString("hex")}`;
  const uploads = path.resolve(".test-artifacts", name);
  const admin = await mariadb.createConnection(options);
  let prisma: PrismaClient | undefined;
  let server: ChildProcess | undefined;
  let ocrFixture: Server | undefined, releaseExtraction: (() => void) | undefined;
  let holdExtraction = false;
  let log = "";
  try {
    await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    url.pathname = `/${name}`;
    const realOcr = process.env.INTEGRATION_OCR_SERVICE_URL;
    let testOcrUrl = realOcr;
    if (!realOcr) {
      ocrFixture = createHttpServer((req,res) => {
        req.resume();
        if (!holdExtraction) { res.destroy(); return; }
        releaseExtraction = () => { if (res.writableEnded || res.destroyed) return; res.writeHead(200,{ "Content-Type": "application/json" }); res.end(JSON.stringify({ pipeline: "printed", raw_text: "Held test extraction", fields: [], line_items: [], overall_confidence: .9, engine: "test fixture" })); };
      });
      await new Promise<void>(resolve => ocrFixture!.listen(0,"127.0.0.1",resolve));
      const address = ocrFixture.address(); assert(address && typeof address !== "string"); testOcrUrl = "http://127.0.0.1:" + address.port;
    }
    const env = { ...process.env, DATABASE_URL: url.toString(), FINANCE_CURRENT_TERM: "2026-2027", NEXTAUTH_SECRET: randomBytes(32).toString("hex"), UPLOAD_DIR: uploads, AWS_S3_BUCKET: "", OCR_SERVICE_URL: testOcrUrl! };
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
    await request(`/api/schedules/${raceGroup.id}`, raceVoucher ? 409 : 200, treasuryCookie, "DELETE");
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

    // Phase 2: a manual workflow against an intentionally unavailable OCR service.
    const extra = await request("/api/schedules", 201, treasuryCookie, "POST", { schedule_number: "P2", activity_type: "IGP", academic_year: "2026-2027", semester: "FIRST" });
    const extraOut = extra.schedules.find((side: { type: string }) => side.type === "OUTFLOW");
    const extraIn = extra.schedules.find((side: { type: string }) => side.type === "INFLOW");
    const dvBody = { ...input, control_number: "DV/2026/2", schedule_id: extraOut.id };
    await request("/api/transactions/vouchers", 400, treasuryCookie, "POST", { ...dvBody, date: "2026-02-30" });
    await request("/api/transactions/vouchers", 400, treasuryCookie, "POST", { ...dvBody, date: "2025-12-31" });
    await request("/api/transactions/vouchers", 400, treasuryCookie, "POST", { ...dvBody, control_number: "DV bad" });
    const extraDV = await request("/api/transactions/vouchers", 201, treasuryCookie, "POST", dvBody);
    const raceEdits = await Promise.all(["Officer A", "Officer B"].map(purpose => fetch(base + "/api/transactions/vouchers/" + extraDV.id, { method: "PATCH", headers: { Cookie: treasuryCookie, Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ ...dvBody, purpose, version: 1 }) })));
    assert.deepEqual(raceEdits.map(response => response.status).sort(), [200,409]);
    const conflictResponse = await raceEdits.find(response => response.status === 409)!.json();
    assert.equal(conflictResponse.current_version, 2); assert.equal(conflictResponse.current.id, extraDV.id); assert.equal(conflictResponse.code, "VERSION_CONFLICT");
    const savedDV = () => prisma!.disbursementVoucher.findUniqueOrThrow({ where: { id: extraDV.id } });
    await request("/api/documents/orphan/link", 200, treasuryCookie, "POST", { scan_id: scanId, transaction_type: "DV", transaction_id: extraDV.id, version: (await savedDV()).version });
    const itemScan = await upload("manual", 201);
    const receiptBody = { kind: "RECEIPT", scan_id: itemScan, internal_receipt_number: "P2-R", reference_number: "SHOP-P2", date: "2026-10-03", doc_type: "RETAILER_RECEIPT", particulars: [{ particular_name: "Cent rounding", quantity: "0.15", unit_cost: "0.10", schedule_id: extraOut.id, link: { transaction_id: extraDV.id, version: (await savedDV()).version } }] };
    const support = await request("/api/documents/supporting", 201, treasuryCookie, "POST", receiptBody);
    assert.equal(support.particulars[0].gross_amount, "0.02");
    await request("/api/verification/toggle", 200, auditorCookie, "POST", { type: "DV", transaction_id: extraDV.id, status: true, version: (await savedDV()).version });
    const itemEdit = { ...receiptBody, version: support.version, parent_versions: [{ type: "DV", id: extraDV.id, version: (await savedDV()).version }], particulars: [{ id: support.particulars[0].id, particular_name: "Changed manual item", quantity: "2", unit_cost: "25", schedule_id: extraOut.id, link: { transaction_id: extraDV.id, version: (await savedDV()).version } }] };
    const updatedSupport = await request("/api/documents/supporting/" + support.id, 200, treasuryCookie, "PATCH", itemEdit);
    assert.equal(updatedSupport.particulars[0].id, support.particulars[0].id); assert.equal((await savedDV()).is_verified, false);
    const supportConflict = await request("/api/documents/supporting/" + support.id, 409, treasuryCookie, "PATCH", itemEdit);
    assert.equal(supportConflict.current_version, updatedSupport.version);
    const secondGroup = await request("/api/schedules", 201, treasuryCookie, "POST", { schedule_number: "P2-MOVE", activity_type: "EVENTS", academic_year: "2026-2027", semester: "FIRST", sides: [{ type: "OUTFLOW", label: "Moved items" }] });
    const secondDV = await request("/api/transactions/vouchers", 201, treasuryCookie, "POST", { ...dvBody, control_number: "DV-MOVED", schedule_id: secondGroup.schedules[0].id });
    const movedBody = { ...receiptBody, version: updatedSupport.version, parent_versions: [{ type: "DV", id: extraDV.id, version: (await savedDV()).version }], particulars: [{ id: support.particulars[0].id, particular_name: "Moved manual item", quantity: "2", unit_cost: "25", schedule_id: secondGroup.schedules[0].id, link: { transaction_id: secondDV.id, version: 1 } }] };
    const moved = await request("/api/documents/supporting/" + support.id, 200, treasuryCookie, "PATCH", movedBody);
    assert.equal(moved.particulars[0].id, support.particulars[0].id); assert.equal(moved.particulars[0].dv_id, secondDV.id);
    await request("/api/documents/supporting/" + support.id, 400, treasuryCookie, "PATCH", { ...movedBody, version: moved.version, particulars: [{ ...movedBody.particulars[0], schedule_id: extraIn.id }] });
    const arBody = { control_number: "AR-P2", date: "2026-10-03", purpose: "Manual fees", amount: "100.00", remitted_by_id: treasurer.id, schedule_id: extraIn.id, form_of_payment: "CASH" };
    const arA = await request("/api/transactions/receipts", 201, treasuryCookie, "POST", arBody);
    const arB = await request("/api/transactions/receipts", 201, treasuryCookie, "POST", { ...arBody, control_number: "AR-P2-B" });
    const arVersion = async (id: number) => (await prisma!.acknowledgementReceipt.findUniqueOrThrow({ where: { id } })).version;
    const allocationScan = await upload("manual", 201);
    const sheetBody = { kind: "SHEET", scan_id: allocationScan, doc_type: "SALES_SHEET", context_label: "Manual sales", period_covered: "October", total_amount: "100.00", links: [{ transaction_id: arA.id, version: 1, amount_covered: "40.00" }, { transaction_id: arB.id, version: 1, amount_covered: "50.00" }] };
    const sheet = await request("/api/documents/supporting", 201, treasuryCookie, "POST", sheetBody);
    for (const id of [arA.id, arB.id]) await request("/api/verification/toggle", 200, auditorCookie, "POST", { type: "AR", transaction_id: id, version: await arVersion(id), status: true });
    const sheetEdit = { ...sheetBody, version: sheet.version, context_label: "Revised sales", parent_versions: [{ type: "AR", id: arA.id, version: await arVersion(arA.id) }, { type: "AR", id: arB.id, version: await arVersion(arB.id) }], links: [{ transaction_id: arA.id, version: await arVersion(arA.id), amount_covered: "60.00" }, { transaction_id: arB.id, version: await arVersion(arB.id), amount_covered: "50.00" }] };
    await request("/api/documents/supporting/" + sheet.id, 400, treasuryCookie, "PATCH", sheetEdit);
    assert.equal((await prisma.aRSupportingDocument.findUniqueOrThrow({ where: { id: sheet.id } })).version, 1);
    sheetEdit.links[0].amount_covered = "50.00";
    const editedSheet = await request("/api/documents/supporting/" + sheet.id, 200, treasuryCookie, "PATCH", sheetEdit);
    for (const id of [arA.id, arB.id]) assert.equal((await prisma.acknowledgementReceipt.findUniqueOrThrow({ where: { id } })).is_verified, false);
    await request("/api/documents/supporting/" + sheet.id, 400, treasuryCookie, "PATCH", { ...sheetEdit, version: editedSheet.version, links: [sheetEdit.links[0], sheetEdit.links[0]] });
    await request("/api/transactions/receipts/" + arA.id, 200, treasuryCookie, "PATCH", { ...arBody, control_number: "AR-P2/NEW", version: await arVersion(arA.id) });
    await request("/api/transactions/receipts", 409, treasuryCookie, "POST", arBody);
    await request("/api/transactions/receipts/" + arA.id, 200, treasuryCookie, "DELETE", { version: await arVersion(arA.id) });
    await request("/api/transactions/receipts", 409, treasuryCookie, "POST", { ...arBody, control_number: "AR-P2/NEW" });
    assert((await prisma.acknowledgementReceipt.findUniqueOrThrow({ where: { id: arA.id } })).deleted_at);
    assert.equal(await prisma.aRSheetLink.count({ where: { ar_id: arA.id } }), 0);
    assert.equal(await prisma.aRSheetLink.count({ where: { ar_id: arB.id } }), 1);
    assert(!(await request("/api/transactions/receipts", 200)).some((row: { id: number }) => row.id === arA.id));
    assert(!(await request("/api/verification", 200)).receipts.some((row: { id: number }) => row.id === arA.id));
    assert((await request("/api/documents/orphan", 200)).some((row: { kind: string; id: number }) => row.kind === "SHEET" && row.id === sheet.id));
    const secondVersion = (await prisma.disbursementVoucher.findUniqueOrThrow({ where: { id: secondDV.id } })).version;
    await request("/api/transactions/vouchers/" + secondDV.id, 403, presidentCookie, "DELETE", { version: secondVersion });
    await request("/api/transactions/vouchers/" + secondDV.id, 200, treasuryCookie, "DELETE", { version: secondVersion });
    assert.equal((await prisma.receiptParticular.findUniqueOrThrow({ where: { id: moved.particulars[0].id } })).dv_id, null);
    const deletedDetail = await request("/api/finance/transactions/DV/" + secondDV.id,200);
    assert.equal(deletedDetail.evidence.length,0); assert(deletedDetail.historical_evidence.some((row: { scan_id: number }) => row.scan_id === itemScan));
    assert(await prisma.documentScan.findUnique({ where: { id: itemScan } }));
    const deleteAudit = await prisma.financialMutation.findFirstOrThrow({ where: { target_type: "DV", target_id: secondDV.id, action: "DELETE" } });
    assert.equal(deleteAudit.user_id, treasurer.id); assert(deleteAudit.before && deleteAudit.after);
    await request("/api/transactions/vouchers", 409, treasuryCookie, "POST", { ...dvBody, control_number: "DV-MOVED" });

    // Queue actions use the version of the support as well as the parent.
    const relinkDV = await request("/api/transactions/vouchers", 201, treasuryCookie, "POST", { ...dvBody, control_number: "DV-RELINK", schedule_id: secondGroup.schedules[0].id });
    const queueItem = (await request("/api/documents/orphan", 200)).find((row: { kind: string; id: number }) => row.kind === "PARTICULAR" && row.id === moved.particulars[0].id);
    assert(queueItem.document_version > moved.version);
    await request("/api/documents/supporting/link", 400, treasuryCookie, "POST", { kind: "PARTICULAR", document_id: queueItem.id, transaction_id: relinkDV.id, version: 1 });
    await request("/api/documents/supporting/link", 200, treasuryCookie, "POST", { kind: "PARTICULAR", document_id: queueItem.id, document_version: queueItem.document_version, transaction_id: relinkDV.id, version: 1 });
    const linkedSupport = await prisma.receipt.findUniqueOrThrow({ where: { id: support.id } });
    const unlinkBody = { ...receiptBody, version: linkedSupport.version, parent_versions: [{ type: "DV", id: relinkDV.id, version: (await prisma.disbursementVoucher.findUniqueOrThrow({ where: { id: relinkDV.id } })).version }], particulars: [{ id: queueItem.id, particular_name: "Unlinked item", quantity: "2", unit_cost: "25", schedule_id: secondGroup.schedules[0].id }] };
    const unlinkedSupport = await request("/api/documents/supporting/" + support.id, 200, treasuryCookie, "PATCH", unlinkBody);
    assert.equal(unlinkedSupport.particulars[0].dv_id, null);
    await request("/api/term", 200, treasuryCookie, "POST", { groupId: secondGroup.id });
    await request("/api/documents/supporting/" + support.id, 403, treasuryCookie, "PATCH", { ...unlinkBody, version: unlinkedSupport.version, particulars: [{ ...unlinkBody.particulars[0], schedule_id: extraOut.id }] });
    const arC = await request("/api/transactions/receipts", 201, treasuryCookie, "POST", { ...arBody, control_number: "AR-P2-C" });
    const arD = await request("/api/transactions/receipts", 201, treasuryCookie, "POST", { ...arBody, control_number: "AR-P2-D" });
    const latestSheet = await prisma.aRSupportingDocument.findUniqueOrThrow({ where: { id: sheet.id } });
    const allocationRaces = await Promise.all([arC, arD].map(row => fetch(base + "/api/documents/supporting/link", { method: "POST", headers: { Cookie: treasuryCookie, Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ kind: "SHEET", document_id: sheet.id, document_version: latestSheet.version, transaction_id: row.id, version: 1, amount_covered: "40.00" }) })));
    assert.deepEqual(allocationRaces.map(response => response.status).sort(), [200,409]);
    const currentSheet = await prisma.aRSupportingDocument.findUniqueOrThrow({ where: { id: sheet.id }, include: { ar_sheet_links: true } });
    assert.equal(currentSheet.ar_sheet_links.length, 2);
    const unallocated = await request("/api/documents/supporting/" + sheet.id, 200, treasuryCookie, "PATCH", { ...sheetBody, version: currentSheet.version, links: [], parent_versions: await Promise.all(currentSheet.ar_sheet_links.map(async link => ({ type: "AR", id: link.ar_id, version: await arVersion(link.ar_id) }))) });
    assert.equal(unallocated.ar_sheet_links.length, 0);
    console.log("Phase 2 manual scans, decimal rounding, conflict snapshots, concurrent edits, support editing/reassignment, shared verification invalidation, soft deletion, retained evidence/audits and permanent control reservations passed.");
    // Remaining phases: one original supports two schedules without duplicate money.
    const mixedGroup = await request("/api/schedules", 201, treasuryCookie, "POST", { schedule_number: "RELEASE-MIXED", activity_type: "EVENTS", academic_year: "2026-2027", semester: "FIRST" });
    const mixedOut = mixedGroup.schedules.find((side: { type: string }) => side.type === "OUTFLOW");
    const mixedIn = mixedGroup.schedules.find((side: { type: string }) => side.type === "INFLOW");
    const mixedA = await request("/api/transactions/vouchers", 201, treasuryCookie, "POST", { ...dvBody, control_number: "DV-MIX-A", amount: "392.00", schedule_id: mixedOut.id });
    const mixedB = await request("/api/transactions/vouchers", 201, treasuryCookie, "POST", { ...dvBody, control_number: "DV-MIX-B", amount: "100.00", schedule_id: extraOut.id });
    const mixedScan = await upload("manual", 201);
    const mixedBody = { kind: "RECEIPT", scan_id: mixedScan, internal_receipt_number: "MIXED-ONE", reference_number: "MIXED-SHOP", date: "2026-10-03", doc_type: "RETAILER_RECEIPT", particulars: [
      { particular_name: "Bond paper", quantity: "1", unit_cost: "392.00", schedule_id: mixedOut.id, link: { transaction_id: mixedA.id, version: 1 } },
      { particular_name: "Pencils", quantity: "2", unit_cost: "50.00", schedule_id: extraOut.id, link: { transaction_id: mixedB.id, version: 1 } },
    ] };
    const mixedReceipt = await request("/api/documents/supporting", 201, treasuryCookie, "POST", mixedBody);
    const dvVersion = async (id: number) => (await prisma!.disbursementVoucher.findUniqueOrThrow({ where: { id } })).version;
    for (const row of [mixedA, mixedB]) {
      const detail = await request("/api/finance/transactions/DV/" + row.id, 200);
      assert.equal(detail.mismatch, false); assert.equal(detail.support_total, Number(row.amount).toFixed(2));
      await request("/api/verification/toggle", 200, auditorCookie, "POST", { type: "DV", transaction_id: row.id, status: true, version: await dvVersion(row.id) });
    }
    const updatedMixed = await request("/api/documents/supporting/" + mixedReceipt.id, 200, treasuryCookie, "PATCH", { ...mixedBody, version: mixedReceipt.version, reference_number: "MIXED-SHOP-REVIEWED", parent_versions: await Promise.all([mixedA,mixedB].map(async row => ({ type: "DV", id: row.id, version: await dvVersion(row.id) }))), particulars: await Promise.all(mixedReceipt.particulars.map(async (item: { id: number }, index: number) => ({ ...mixedBody.particulars[index], id: item.id, link: { transaction_id: [mixedA,mixedB][index].id, version: await dvVersion([mixedA,mixedB][index].id) } }))) });
    for (const row of [mixedA,mixedB]) assert.equal((await prisma.disbursementVoucher.findUniqueOrThrow({ where: { id: row.id } })).is_verified, false);
    assert.equal((await prisma.documentScan.findUniqueOrThrow({ where: { id: mixedScan } })).reviewed_values !== null, true);
    for (const side of [mixedOut,extraOut]) {
      const view = await request("/api/finance?term=2026-2027&schedule_id=" + side.id + "&q=MIXED-SHOP", 200);
      assert.equal(view.count, 1); assert.equal(view.supporting[0].id, updatedMixed.id);
    }
    const filters = "term=2026-2027&q=MIXED-SHOP&from=2026-10-03&to=2026-10-03&kind=DV";
    const firstPage = await request("/api/finance?" + filters + "&page_size=1", 200);
    const secondPage = await request("/api/finance?" + filters + "&page_size=1&page=2", 200);
    const exported = await request("/api/finance/export?" + filters, 200);
    assert.equal(firstPage.count, 2); assert.equal(firstPage.records.length, 1); assert.equal(secondPage.records.length, 1);
    assert.notEqual(firstPage.records[0].id, secondPage.records[0].id);
    assert.equal(firstPage.totals.outflow, "492.00"); assert.deepEqual(exported.totals, firstPage.totals);
    await request("/api/finance?from=2026-10-04&to=2026-10-03", 400);
    await request("/api/finance", 403, adminCookie);
    assert.equal((await request("/api/suggestions?name=No-history-item", 200)).length, 0);
    assert((await request("/api/suggestions?name=Bond%20paper", 200)).some((row: { schedule_id: number }) => row.schedule_id === mixedOut.id));
    const partialA = await request("/api/transactions/receipts", 201, treasuryCookie, "POST", { ...arBody, control_number: "AR-PART-A", amount: "1000.00", schedule_id: mixedIn.id });
    const partialB = await request("/api/transactions/receipts", 201, treasuryCookie, "POST", { ...arBody, control_number: "AR-PART-B", amount: "1100.00", schedule_id: mixedIn.id });
    const partialSheet = await request("/api/documents/supporting", 201, treasuryCookie, "POST", { kind: "SHEET", scan_id: await upload("manual",201), doc_type: "COLLECTION_SHEET", context_label: "PARTIAL-2100", total_amount: "2100.00", links: [{ transaction_id: partialA.id, version: 1, amount_covered: "1000.00" }] });
    assert.equal((await request("/api/finance/transactions/AR/" + partialA.id, 200)).mismatch, false);
    assert.equal((await request("/api/documents/orphan?term=2026-2027", 200)).find((row: { kind: string; id: number }) => row.kind === "SHEET" && row.id === partialSheet.id).remaining, "1100.00");
    await request("/api/documents/supporting/link", 200, treasuryCookie, "POST", { kind: "SHEET", document_id: partialSheet.id, document_version: partialSheet.version, transaction_id: partialB.id, version: 1, amount_covered: "1100.00" });
    assert(!(await request("/api/documents/orphan?term=2026-2027", 200)).some((row: { kind: string; id: number }) => row.kind === "SHEET" && row.id === partialSheet.id));
    const softFlag = await request("/api/transactions/vouchers/" + mixedA.id, 200, treasuryCookie, "PATCH", { ...dvBody, control_number: mixedA.control_number, amount: "500.00", schedule_id: mixedOut.id, version: await dvVersion(mixedA.id) });
    const softDetail = await request("/api/finance/transactions/DV/" + mixedA.id, 200);
    assert.equal(softDetail.difference, "108.00"); assert.equal(softDetail.mismatch, true);
    await request("/api/verification/toggle", 200, auditorCookie, "POST", { type: "DV", transaction_id: mixedA.id, status: true, version: softFlag.version });
    await request("/api/verification/toggle", 409, auditorCookie, "POST", { type: "DV", transaction_id: mixedA.id, status: false, version: softFlag.version });
    const guidedUpload = async (side: number, docType: string, mode: string, pipeline: string, status: number, scanId?: number) => {
      const form = new FormData(); if (scanId) form.append("scan_id",String(scanId)); else form.append("file", new Blob([new Uint8Array(await readFile(".test-artifacts/ocr-smoke.png"))], { type: "image/png" }), "receipt.png");
      form.append("schedule_id",String(side)); form.append("document_type",docType); form.append("mode",mode); form.append("pipeline",pipeline);
      const response = await fetch(base + "/api/ocr/process", { method: "POST", headers: { Cookie: treasuryCookie, Origin: base }, body: form }); const result = await response.json(); assert.equal(response.status,status,JSON.stringify(result)); return result;
    };
    const scanCount = await prisma.documentScan.count();
    await guidedUpload(mixedIn.id,"DV","PRIMARY","manual",400); assert.equal(await prisma.documentScan.count(),scanCount);
    const manualSheet = await guidedUpload(mixedIn.id,"COLLECTION_SHEET","SUPPORTING","printed",201); assert.equal(manualSheet.extractedData,null);
    const retained = await guidedUpload(mixedOut.id,"DV","PRIMARY","printed",realOcr ? 200 : 503);
    await guidedUpload(mixedOut.id,"DV","PRIMARY","manual",201,retained.scanId);
    assert.equal(await prisma.documentScan.count(),scanCount + 2);
    const frozenSource = await request("/api/schedules",201,treasuryCookie,"POST",{ schedule_number: "OCR-FROZEN",activity_type: "EVENTS",academic_year: "2026-2027",semester: "FIRST",sides: [{ type: "OUTFLOW",label: "Frozen source" }] });
    const frozenScan = await guidedUpload(frozenSource.schedules[0].id,"DV","PRIMARY","manual",201);
    await request("/api/term",200,treasuryCookie,"POST",{ groupId: frozenSource.id });
    await guidedUpload(mixedOut.id,"DV","PRIMARY","manual",403,frozenScan.scanId);
    await request("/api/transactions/vouchers",403,treasuryCookie,"POST",{ ...dvBody,control_number: "DV-FROZEN-SCAN",schedule_id: mixedOut.id,scan_file_id: frozenScan.scanId });
    const unlinkedContextGroup = await request("/api/schedules",201,treasuryCookie,"POST",{ schedule_number: "UNLINKED-CONTEXT",activity_type: "EVENTS",academic_year: "2026-2027",semester: "FIRST" });
    const contextIn = unlinkedContextGroup.schedules.find((side: { type: string }) => side.type === "INFLOW");
    const contextualScan = await guidedUpload(contextIn.id,"COLLECTION_SHEET","SUPPORTING","manual",201);
    const contextualBody = { kind: "SHEET",scan_id: contextualScan.scanId,doc_type: "COLLECTION_SHEET",context_label: "Unlinked frozen context",total_amount: "100.00",links: [] };
    const contextualSheet = await request("/api/documents/supporting",201,treasuryCookie,"POST",contextualBody);
    await request("/api/term",200,treasuryCookie,"POST",{ groupId: unlinkedContextGroup.id });
    await request("/api/documents/supporting/" + contextualSheet.id,403,treasuryCookie,"PATCH",{ ...contextualBody,version: contextualSheet.version });
    if (!realOcr) {
      const inFlightGroup = await request("/api/schedules",201,treasuryCookie,"POST",{ schedule_number: "INFLIGHT",activity_type: "EVENTS",academic_year: "2026-2027",semester: "FIRST",sides: [{ type: "OUTFLOW",label: "In-flight extraction" }] });
      holdExtraction = true;
      const pendingRequest = guidedUpload(inFlightGroup.schedules[0].id,"DV","PRIMARY","printed",409);
      for (let attempt = 0; !releaseExtraction && attempt < 200; attempt++) await new Promise(resolve => setTimeout(resolve,25));
      assert(releaseExtraction,"Held OCR request did not reach fixture.");
      const pending = await prisma.documentScan.findFirstOrThrow({ where: { suggested_schedule_id: inFlightGroup.schedules[0].id,ocr_status: "PENDING" } });
      await request("/api/term",200,treasuryCookie,"POST",{ groupId: inFlightGroup.id });
      releaseExtraction(); await pendingRequest; holdExtraction = false;
      const frozen = await prisma.documentScan.findUniqueOrThrow({ where: { id: pending.id } });
      assert.equal(frozen.ocr_version,pending.ocr_version); assert.equal(frozen.ocr_status,pending.ocr_status); assert.equal(frozen.ocr_raw_text,null);
    }
    await request("/api/oms/archive?term=2026-2027", 409, adminCookie);
    console.log("Phases 3–6 and suggestions passed: mixed receipts, signed soft flags, shared audit invalidation, partial sheet coverage, consistent filters/pagination/export totals, branch guards and scan reuse.");
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
    const beforeClose = await request("/api/oms/terms",200,adminCookie);
    await request("/api/oms/close",403,treasuryCookie,"POST",{ term: "2026-2027",version: beforeClose.version,confirmation: "CLOSE TERM" });
    await request("/api/oms/close",200,adminCookie,"POST",{ term: "2026-2027",version: beforeClose.version,confirmation: "CLOSE TERM" });
    const afterClose = await request("/api/oms/terms",200,adminCookie);
    await request("/api/oms/terms",403,adminCookie,"POST",{ name: "2026-2027",starts_on: "2026-01-01",ends_on: "2027-12-31",make_current: true,version: afterClose.version });
    const archive = validateArchive(await request("/api/oms/archive?term=2026-2027",200,adminCookie) as FinanceArchive);
    assert(archive.data.disbursement_vouchers.some(row => row.id === secondDV.id && row.deleted_at));
    assert(archive.data.financial_mutations.some(row => row.action === "CLOSE_TERM"));
    assert(archive.files.some(row => row.scan_id === retained.scanId));
    const restored = await restoreAndVerify(archive,process.env.DATABASE_URL!);
    assert.equal(restored.verified_images,archive.files.length);
    const openFuture = await request("/api/oms/terms",200,adminCookie);
    await request("/api/oms/terms",200,adminCookie,"POST",{ name: "2027-2028",starts_on: "2026-01-01",ends_on: "2027-12-31",make_current: true,version: openFuture.version });
    const currentClose = await request("/api/oms/terms",200,adminCookie);
    await request("/api/oms/close",200,adminCookie,"POST",{ term: "2027-2028",version: currentClose.version,confirmation: "CLOSE TERM" });
    await request("/api/schedules",403,treasuryCookie,"POST",{ schedule_number: "SEALED",activity_type: "EVENTS",academic_year: "2027-2028",semester: "FIRST" });
    await upload("manual",403);
    await request("/api/documents/supporting/" + partialSheet.id,403,treasuryCookie,"PATCH",{ kind: "SHEET",scan_id: partialSheet.scan_file_id,doc_type: "COLLECTION_SHEET",context_label: "Sealed",total_amount: "2100.00",links: [] });
    console.log("Phase 7 passed: Admin-only term-wide closure, historical reads, blocked calendar reopening/direct writes, archive manifest/credentials policy, isolated database restoration and original-image checksums.");
    console.log("Integration checks passed: Phase 1 five-role journeys, collection-officer exclusion, OMS calendars/turnover, defaults/custom sides, safe renames with preserved links, used/closed/historical side protections, side mutation/create race, plus existing account, transaction, audit, storage, OCR fallback, support, reconciliation and closure regressions.");
  } catch (error) {
    console.error("Integration failure:", error, log);
    throw error;
  } finally {
    if (server && server.exitCode === null) { server.kill(); await new Promise(resolve => server!.once("exit", resolve)); }
    releaseExtraction?.(); ocrFixture?.closeAllConnections(); if (ocrFixture) await new Promise<void>(resolve => ocrFixture!.close(() => resolve()));
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
