import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { stdin, stdout } from "node:process";
import prisma from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { accountInput } from "../src/lib/accounts";
async function main() {
  const rl = createInterface({ input: stdin, output: stdout });
  const name = await rl.question("Admin name: ");
  const email = (await rl.question("Admin email: ")).trim();
  rl.close();
  const output = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const passwords = createInterface({ input: stdin, output, terminal: true });
  stdout.write("Password (at least 12 characters; hidden): ");
  const password = await passwords.question("");
  stdout.write("\nConfirm password (hidden): ");
  const confirmation = await passwords.question(""); passwords.close(); stdout.write("\n");
  const input = accountInput.parse({ name, email, password, confirmation });
  const password_hash = await hashPassword(input.password);
  await prisma.user.create({ data: { name: input.name, email: input.email, password_hash, role_type: "ADMIN" } });
  console.log("Admin created. Use Account management in the website for additional accounts.");
}
main().catch(() => { console.error("Admin creation failed. Check input, email uniqueness, and database availability."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
