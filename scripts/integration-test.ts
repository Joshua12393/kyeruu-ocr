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
    const auditor = await prisma.user.create({ data: { name: "Test Auditor", role_type: "OFFICER", officer_terms: { create: { position: "AUDITOR", term: "2026-2027" } } } });
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
    const cookie = async (id: number) => `next-auth.session-token=${await encode({ secret: env.NEXTAUTH_SECRET, token: { userId: String(id) }, maxAge: 3600 })}`;
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
      const response = await fetch(`${base}${route}`, { method, headers: { ...(session ? { Cookie: session } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const data = await response.json();
      assert.equal(response.status, status, `${method} ${route}: ${JSON.stringify(data)}\n${log}`);
      return data;
    };
    // Guard regressions: a response containing an error must stop all subsequent work.
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
    await request(`/api/schedules/${group.id}`, 409, treasuryCookie, "PATCH", { schedule_number: "CHANGED" });
    await request("/api/term", 200, treasuryCookie, "POST", { groupId: group.id });
    await request("/api/transactions/vouchers", 403, treasuryCookie, "POST", { ...input, control_number: "DV-CLOSED" });
    await request(`/api/transactions/vouchers/${voucher.id}`, 403, treasuryCookie, "PATCH", { ...input, version: 4 });
    await request("/api/documents/orphan/link", 403, treasuryCookie, "POST", { scan_id: scanId, transaction_type: "DV", transaction_id: voucher.id, version: 4 });
    await request("/api/verification/toggle", 403, auditorCookie, "POST", { transaction_id: voucher.id, type: "DV", status: true, version: 4 });
    const emptyGroup = await request("/api/schedules", 201, treasuryCookie, "POST", { schedule_number: "EMPTY", activity_type: "EVENTS", academic_year: "2026-2027", semester: "SECOND" });
    await request(`/api/schedules/${emptyGroup.id}`, 200, treasuryCookie, "DELETE");
    console.log("Integration checks passed: authorization, term roles, transactions, stale saves, audit history, private uploads, OCR failure recovery, supporting documents, reconciliation, term closure, and schedule deletion.");
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
