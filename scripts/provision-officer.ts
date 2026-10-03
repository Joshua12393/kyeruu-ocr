import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { stdin, stdout } from "node:process";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { z } from "zod";

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });
  const email = z.email().parse((await rl.question("Officer email: ")).trim().toLowerCase());
  const name = z.string().trim().min(1).max(255).parse(await rl.question("Officer name: "));
  const term = z.string().min(1).max(50).parse(process.env.FINANCE_CURRENT_TERM || await rl.question("Active officer term: "));
  const position = z.enum(["ADVISER", "PRESIDENT", "TREASURER", "ASSISTANT_TREASURER", "AUDITOR"]).parse((await rl.question("Position (TREASURER, ASSISTANT_TREASURER, AUDITOR, PRESIDENT, ADVISER): ")).trim().toUpperCase());
  rl.close();
  let muted = false;
  const output = new Writable({ write(chunk, _encoding, callback) { if (!muted) stdout.write(chunk); callback(); } });
  const passwords = createInterface({ input: stdin, output, terminal: true });
  stdout.write("Password (12–256 characters; hidden): "); muted = true;
  const password = await passwords.question("");
  muted = false; stdout.write("\nConfirm password: "); muted = true;
  const confirmation = await passwords.question(""); passwords.close(); stdout.write("\n");
  if (password !== confirmation) throw new Error("Passwords do not match.");
  const password_hash = await hashPassword(password);
  await prisma.$transaction(async tx => {
    const user = await tx.user.upsert({ where: { email }, create: { email, name, role_type: position === "ADVISER" ? "ADVISER" : "OFFICER", password_hash }, update: { name, password_hash } });
    await tx.officerTerm.create({ data: { user_id: user.id, term, position } });
  });
  console.log(`Officer account configured for ${term}.`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Provisioning failed."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
