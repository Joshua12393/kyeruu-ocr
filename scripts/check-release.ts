import "dotenv/config";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
async function main() {
  const url = new URL(process.env.NEXTAUTH_URL || "http://localhost:3000");
  const local = ["localhost","127.0.0.1","[::1]"].includes(url.hostname);
  if (!local && url.protocol !== "https:") throw new Error("A public deployment requires HTTPS NEXTAUTH_URL.");
  if (!process.env.NEXTAUTH_SECRET || process.env.NEXTAUTH_SECRET.length < 32 || /replace|example/i.test(process.env.NEXTAUTH_SECRET)) throw new Error("Configure a random NEXTAUTH_SECRET of at least 32 characters.");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const ocr = new URL(process.env.OCR_SERVICE_URL || "http://127.0.0.1:8000");
  if (!["localhost","127.0.0.1","[::1]"].includes(ocr.hostname) && (!process.env.OCR_SERVICE_TOKEN || ocr.protocol !== "https:")) throw new Error("A remote OCR host requires HTTPS and OCR_SERVICE_TOKEN.");
  if (!process.env.AWS_S3_BUCKET) { const root = path.resolve(process.env.UPLOAD_DIR || "private-uploads"); if (root.toLowerCase() === path.resolve("public").toLowerCase() || root.toLowerCase().startsWith(path.resolve("public").toLowerCase() + path.sep)) throw new Error("Scan storage must be outside public."); await mkdir(root,{ recursive: true }); const probe = path.join(root,"release-probe-" + randomBytes(8).toString("hex")); await writeFile(probe,"storage check",{ flag: "wx" }); await unlink(probe); }
  console.log("Release configuration checks passed. Verify persistent disk/S3 policy, reverse-proxy HTTPS, backups and health monitoring on the actual hosting environment before publishing.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
