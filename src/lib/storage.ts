import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { ApiError } from "@/lib/api";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
// Scans are runtime data, never build inputs or deployable source files.
const uploadRoot = () => path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR || "./private-uploads");
const s3 = () => new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
export async function validateImage(value: FormDataEntryValue | null) {
  if (!(value instanceof File)) throw new ApiError(400, "An image file is required.");
  if (!value.size || value.size > MAX_UPLOAD_BYTES) throw new ApiError(400, "Upload a nonempty image no larger than 10 MB.");
  const bytes = Buffer.from(await value.arrayBuffer());
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  const mime = png ? "image/png" : jpeg ? "image/jpeg" : webp ? "image/webp" : null;
  if (!mime || value.type !== mime) throw new ApiError(400, "Only valid PNG, JPEG, and WebP images are accepted.");
  return { bytes, mime, extension: png ? "png" : jpeg ? "jpg" : "webp" };
}
export async function saveImage(image: Awaited<ReturnType<typeof validateImage>>) {
  const key = `finance-scans/${randomUUID()}.${image.extension}`;
  if (process.env.AWS_S3_BUCKET) {
    await s3().send(new PutObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key, Body: image.bytes, ContentType: image.mime }));
    return `s3:${key}`;
  }
  const target = path.join(uploadRoot(), key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, image.bytes, { flag: "wx" });
  return `local:${key}`;
}
function parseStorageKey(location: string) {
  const match = /^(local|s3):(finance-scans\/[a-f0-9-]+\.(png|jpg|webp))$/.exec(location);
  if (!match) throw new ApiError(404, "Scan file is unavailable.");
  return { backend: match[1], key: match[2], mime: match[3] === "jpg" ? "image/jpeg" : `image/${match[3]}` };
}
export async function readImage(location: string) {
  const stored = parseStorageKey(location);
  const bytes = stored.backend === "local" ? await readFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ uploadRoot(), stored.key)) : await (await s3().send(new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: stored.key }))).Body?.transformToByteArray();
  if (!bytes) throw new ApiError(404, "Scan file is unavailable.");
  return { bytes, mime: stored.mime };
}
export async function removeImage(location: string) {
  const stored = parseStorageKey(location);
  if (stored.backend === "s3") await s3().send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: stored.key }));
  else {
    const { unlink } = await import("node:fs/promises");
    await unlink(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ uploadRoot(), stored.key));
  }
}
