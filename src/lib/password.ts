import { randomBytes, scrypt as deriveKey, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(deriveKey);

export async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 256) throw new Error("Password must contain 12–256 characters.");
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, hash: string | null) {
  if (!hash || password.length > 256) return false;
  const [algorithm, salt, digest] = hash.split(":");
  if (algorithm !== "scrypt" || !/^[a-f0-9]{32}$/.test(salt || "") || !/^[a-f0-9]{128}$/.test(digest || "")) return false;
  const key = await scrypt(password, salt, 64) as Buffer;
  return timingSafeEqual(key, Buffer.from(digest, "hex"));
}
