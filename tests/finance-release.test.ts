import assert from "node:assert/strict";
import { test } from "node:test";
import { financeFilters, evidenceState } from "../src/lib/finance-query";
import { allowedDocumentTypes, draftSchema } from "../src/lib/ocr-draft";
import { limitedOcr } from "../src/lib/ocr-limit";
import { ARCHIVE_TABLES, hash, validateArchive, type FinanceArchive, type ArchiveData } from "../src/lib/archive-format";

test("Evidence flags distinguish missing support, exact match and signed mismatch", () => {
  assert.deepEqual(evidenceState("500", []), { support_total: "0.00", difference: "500.00", incomplete: true, mismatch: false });
  assert.equal(evidenceState(".30", [".1", ".2"]).mismatch, false);
  assert.equal(evidenceState("100", ["110"]).difference, "-10.00");
  assert.equal(evidenceState("1000", ["1000"]).mismatch, false);
});
test("Shared filters reject reversed periods and excessive pages", () => {
  assert.throws(() => financeFilters(new URLSearchParams("from=2026-10-04&to=2026-10-03")));
  assert.throws(() => financeFilters(new URLSearchParams("page_size=101")));
  assert.equal(financeFilters(new URLSearchParams(), "2026-2027").term, "2026-2027");
});
test("Drafts preserve unknown quantity/cost and branch constraints", () => {
  assert.deepEqual(allowedDocumentTypes("INFLOW", "PRIMARY"), ["AR"]);
  assert(!allowedDocumentTypes("INFLOW", "SUPPORTING").includes("RETAILER_RECEIPT"));
  const draft = draftSchema.parse({ kind: "RECEIPT", scanId: 1, scheduleId: 2, documentType: "RETAILER_RECEIPT", fields: {}, items: [{ particular: "Paper", amount: 100, quantity: null, unit_cost: null, confidence: .8 }] });
  assert.equal(draft.items[0].quantity, null);
});
test("OCR limiter never exceeds two workers even after a failure", async () => {
  let active = 0, peak = 0;
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => limitedOcr(async () => {
    peak = Math.max(peak, ++active);
    try { await new Promise(resolve => setTimeout(resolve, 5)); if (index === 1) throw new Error("sample failure"); return index; } finally { active--; }
  })));
  assert.equal(peak, 2); assert.equal(active, 0); assert.equal(results.filter(row => row.status === "rejected").length, 1);
});
test("Archive checks reject tampered metadata and missing original bytes", () => {
  const data = Object.fromEntries(ARCHIVE_TABLES.map(table => [table, []])) as unknown as ArchiveData;
  data.document_scans.push({ id: 1 });
  const bytes = Buffer.from("original");
  const manifest = { organization: "single-organization-pilot", term: "2026-2027", exported_at: "2026-10-04", exported_by: 1, data_sha256: hash(JSON.stringify(data)), counts: Object.fromEntries(ARCHIVE_TABLES.map(table => [table, data[table].length])), scan_count: 1, scope: "Selected term", unassigned_legacy_scans_excluded: 0, complete: true as const };
  const bundle: FinanceArchive = { format: "kyeruu-finance-archive-v1", data, manifest, manifest_sha256: hash(JSON.stringify(manifest)), files: [{ scan_id: 1, sha256: hash(bytes), bytes_base64: bytes.toString("base64") }] };
  assert.equal(validateArchive(bundle), bundle);
  assert.throws(() => validateArchive({ ...bundle, files: [] }));
  assert.throws(() => validateArchive({ ...bundle, files: [{ ...bundle.files[0], bytes_base64: "dGFtcGVy" }] }));
  assert.throws(() => validateArchive({ ...bundle, manifest: { ...manifest, term: "changed" } }));
});
