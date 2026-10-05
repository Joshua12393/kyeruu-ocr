import { createHash } from "node:crypto";
export const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
export const ARCHIVE_TABLES = ["academic_terms", "oms_settings", "users", "officer_terms", "schedule_groups", "schedules", "document_scans", "disbursement_vouchers", "acknowledgement_receipts", "receipts", "receipt_particulars", "ar_supporting_documents", "ar_sheet_links", "verification_events", "financial_mutations", "control_number_reservations"] as const;
export type ArchiveData = Record<typeof ARCHIVE_TABLES[number], Record<string, unknown>[]>;
export type FinanceArchive = { format: "kyeruu-finance-archive-v1"; manifest: { organization: string; term: string; exported_at: string; exported_by: number; data_sha256: string; counts: Record<string, number>; scan_count: number; scope: string; unassigned_legacy_scans_excluded: number; complete: true }; manifest_sha256: string; data: ArchiveData; files: { scan_id: number; sha256: string; bytes_base64: string }[] };
export function validateArchive(value: FinanceArchive) {
  if (value.format !== "kyeruu-finance-archive-v1" || value.manifest.complete !== true || value.manifest.organization !== "single-organization-pilot") throw new Error("Unsupported or incomplete archive.");
  if (hash(JSON.stringify(value.manifest)) !== value.manifest_sha256 || hash(JSON.stringify(value.data)) !== value.manifest.data_sha256) throw new Error("Archive manifest or data checksum failed.");
  for (const table of ARCHIVE_TABLES) if (!Array.isArray(value.data[table]) || value.manifest.counts[table] !== value.data[table].length) throw new Error("Archive table count failed: " + table);
  if (Object.keys(value.data).some(table => !ARCHIVE_TABLES.includes(table as typeof ARCHIVE_TABLES[number]))) throw new Error("Unexpected archive table.");
  const ids = new Set<number>();
  for (const file of value.files) { if (ids.has(file.scan_id) || !value.data.document_scans.some(scan => scan.id === file.scan_id) || hash(Buffer.from(file.bytes_base64, "base64")) !== file.sha256) throw new Error("Archive scan integrity failed."); ids.add(file.scan_id); }
  if (ids.size !== value.data.document_scans.length || ids.size !== value.manifest.scan_count) throw new Error("Archive is missing original scans.");
  if (value.data.users.some(user => "password_hash" in user && user.password_hash != null || user.is_active !== false)) throw new Error("Archive must not contain usable login credentials.");
  return value;
}
