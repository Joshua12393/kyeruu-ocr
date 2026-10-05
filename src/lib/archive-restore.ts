import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import mariadb from "mariadb";
import { Prisma } from "@prisma/client";
import { ARCHIVE_TABLES, hash, validateArchive, type FinanceArchive } from "./archive-format";
/** Always restores into a newly-created isolated database; never into application data. */
export async function restoreAndVerify(bundle: FinanceArchive, rootUrl: string, retain = false) {
  validateArchive(bundle);
  const name = "kyeruu_restore_" + randomBytes(6).toString("hex"), root = path.resolve(".test-artifacts", name), url = new URL(rootUrl);
  const options = { host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), timezone: "+00:00", dateStrings: true };
  const db = await mariadb.createConnection(options); let created = false, verified = false, storageCreated = false;
  try {
    await db.query("CREATE DATABASE `" + name + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"); created = true; url.pathname = "/" + name;
    await mkdir(path.dirname(root), { recursive: true }); await mkdir(root); storageCreated = true;
    const migration = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url.toString() }, encoding: "utf8", windowsHide: true });
    assert.equal(migration.status, 0, "Isolated restore migrations failed."); await db.query("USE `" + name + "`"); await db.beginTransaction();
    const data = structuredClone(bundle.data);
    for (const table of ARCHIVE_TABLES) {
      const columns = await db.query("SHOW COLUMNS FROM `" + table + "`") as { Field: string; Type: string }[];
      const allowed = new Map(columns.map(column => [column.Field,column.Type]));
      for (const row of data[table]) {
        if (table === "document_scans") { const location = String(row.file_path); const key = /^(?:local|s3):(finance-scans\/[a-f0-9-]+\.(?:png|jpg|webp))$/.exec(location)?.[1]; if (!key) throw new Error("Unsafe archive storage key."); row.file_path = "local:" + key; const file = bundle.files.find(file => file.scan_id === row.id)!; await mkdir(path.dirname(path.join(root,key)), { recursive: true }); await writeFile(path.join(root,key), Buffer.from(file.bytes_base64,"base64"), { flag: "wx" }); }
        const fields = Object.keys(row); if (fields.some(field => !allowed.has(field))) throw new Error("Unexpected archive field for " + table);
        const values = fields.map(field => { const value = row[field], type = allowed.get(field)!; if (value === null) return null; if (/^(date|datetime|timestamp)/.test(type)) { const iso = new Date(String(value)).toISOString(); return /^date\b/.test(type) ? iso.slice(0,10) : iso.replace("T"," ").replace("Z",""); } if (typeof value === "object") return JSON.stringify(value); return value; });
        await db.query("INSERT INTO `" + table + "` (" + fields.map(field => "`" + field + "`").join(",") + ") VALUES (" + fields.map(() => "?").join(",") + ")", values);
      }
    }
    await db.commit();
    for (const table of ARCHIVE_TABLES) {
      const rows = await db.query("SELECT * FROM `" + table + "`") as Record<string, unknown>[];
      assert.equal(rows.length, bundle.manifest.counts[table], "Restored count differs: " + table);
      const columns = await db.query("SHOW COLUMNS FROM `" + table + "`") as { Field: string; Type: string }[];
      for (const expected of data[table]) {
        const actual = rows.find(row => table === "control_number_reservations" ? row.kind === expected.kind && row.number === expected.number : String(row.id ?? row.name) === String(expected.id ?? expected.name));
        assert(actual, "Missing restored record: " + table);
        for (const [field,value] of Object.entries(expected)) {
          const restored: unknown = actual[field]; const type: string = columns.find(column => column.Field === field)!.Type;
          if (value === null) assert.equal(restored,null);
          else if (/^(date|datetime|timestamp)/.test(type)) { const text = String(restored); const utc = text.length === 10 ? text + "T00:00:00Z" : text.replace(" ","T") + "Z"; assert.equal(new Date(utc).toISOString(),new Date(String(value)).toISOString()); }
          else if (/^decimal/.test(type)) assert(new Prisma.Decimal(String(restored)).equals(String(value)),"Restored amount differs.");
          else if (typeof value === "object") assert.deepEqual(typeof restored === "string" ? JSON.parse(restored) : restored,value);
          else if (typeof value === "boolean") assert.equal(Boolean(restored),value);
          else assert.equal(String(restored),String(value),"Restored field differs: " + table + "." + field);
        }
      }
    }
    for (const file of bundle.files) { const scan = data.document_scans.find(scan => scan.id === file.scan_id)!; const key = String(scan.file_path).slice(6); assert.equal(hash(await readFile(path.join(root,key))),file.sha256,"Restored original image differs."); }
    verified = true;
    return { database: name, upload_directory: root, counts: bundle.manifest.counts, verified_images: bundle.files.length, retained: retain };
  } finally {
    if (!retain || !verified) { assert(/^kyeruu_restore_[a-f0-9]{12}$/.test(name)); if (created) await db.query("DROP DATABASE `" + name + "`"); assert(root.startsWith(path.resolve(".test-artifacts") + path.sep)); if (storageCreated) await rm(root,{ recursive: true,force: true }); }
    await db.end();
  }
}
