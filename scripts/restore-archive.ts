import "dotenv/config";
import { readFile } from "node:fs/promises";
import { restoreAndVerify } from "../src/lib/archive-restore";
import type { FinanceArchive } from "../src/lib/archive-format";
async function main() {
  if (!process.argv[2] || !process.env.DATABASE_URL) throw new Error("Usage: npm run archive:verify -- archive.json [--retain]. DATABASE_URL supplies a server connection, never a restore target.");
  const bundle = JSON.parse(await readFile(process.argv[2],"utf8")) as FinanceArchive;
  console.log(await restoreAndVerify(bundle,process.env.DATABASE_URL,process.argv.includes("--retain")));
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
