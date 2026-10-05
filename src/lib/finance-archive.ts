import prisma from "./prisma";
import { ApiError } from "./api";
import { readImage } from "./storage";
import { hash, type ArchiveData, type FinanceArchive } from "./archive-format";
export async function createFinanceArchive(termName: string, actorId: number) {
  const raw = await prisma.$transaction(async tx => {
    const term = await tx.academicTerm.findUnique({ where: { name: termName } }); if (!term?.closed_at) throw new ApiError(409, "Close the OMS term before exporting its complete archive.");
    const groups = await tx.scheduleGroup.findMany({ where: { academic_year: termName } }), schedules = await tx.schedule.findMany({ where: { group: { academic_year: termName } } });
    const vouchers = await tx.disbursementVoucher.findMany({ where: { schedule: { group: { academic_year: termName } } } }), receipts = await tx.acknowledgementReceipt.findMany({ where: { schedule: { group: { academic_year: termName } } } });
    const receiptDocs = await tx.receipt.findMany({ where: { OR: [{ academic_year: termName }, { particulars: { some: { schedule: { group: { academic_year: termName } } } } }] } }), sheets = await tx.aRSupportingDocument.findMany({ where: { OR: [{ academic_year: termName }, { ar_sheet_links: { some: { ar_id: { in: receipts.map(row => row.id) } } } }] } });
    const items = await tx.receiptParticular.findMany({ where: { receipt_id: { in: receiptDocs.map(row => row.id) } } }), links = await tx.aRSheetLink.findMany({ where: { ar_supporting_document_id: { in: sheets.map(row => row.id) } } });
    if (items.some(item => !schedules.some(side => side.id === item.schedule_id)) || links.some(link => !receipts.some(row => row.id === link.ar_id))) throw new ApiError(409, "A legacy supporting document spans terms. Resolve ownership before creating a term archive.");
    const scanIds = [...vouchers.flatMap(row => row.scan_file_id ? [row.scan_file_id] : []), ...receipts.flatMap(row => row.scan_file_id ? [row.scan_file_id] : []), ...receiptDocs.map(row => row.scan_file_id), ...sheets.map(row => row.scan_file_id)];
    const scans = await tx.documentScan.findMany({ where: { OR: [{ academic_year: termName }, { id: { in: scanIds } }] } });
    const events = await tx.verificationEvent.findMany({ where: { OR: [{ dv_id: { in: vouchers.map(row => row.id) } }, { ar_id: { in: receipts.map(row => row.id) } }] } });
    const mutations = await tx.financialMutation.findMany({ where: { OR: [{ target_type: "DV", target_id: { in: vouchers.map(row => row.id) } }, { target_type: "AR", target_id: { in: receipts.map(row => row.id) } }, { target_type: "RECEIPT", target_id: { in: receiptDocs.map(row => row.id) } }, { target_type: "SHEET", target_id: { in: sheets.map(row => row.id) } }, { target_type: "SCAN", target_id: { in: scans.map(row => row.id) } }, { target_type: "TERM", action: "CLOSE_TERM", after: { path: "$.name", equals: termName } }] } });
    const userIds = [...scans.map(row => row.uploaded_by_id), ...vouchers.flatMap(row => [row.released_to_id, row.verified_by_id, row.deleted_by_id]), ...receipts.flatMap(row => [row.remitted_by_id, row.verified_by_id, row.deleted_by_id]), ...events.map(row => row.user_id), ...mutations.map(row => row.user_id), term.closed_by_id, actorId].filter((id): id is number => id !== null);
    const users = await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true, role_type: true } });
    const assignments = await tx.officerTerm.findMany({ where: { user_id: { in: userIds }, term: termName } });
    const controls = await tx.controlNumberReservation.findMany({ where: { OR: [{ kind: "DV", target_id: { in: vouchers.map(row => row.id) } }, { kind: "AR", target_id: { in: receipts.map(row => row.id) } }] } });
    return { academic_terms: [term], oms_settings: [{ id: 1, current_term: termName, version: 1 }], users: users.map(user => ({ ...user, is_active: false, password_hash: null, auth_version: 0 })), officer_terms: assignments, schedule_groups: groups, schedules, document_scans: scans, disbursement_vouchers: vouchers, acknowledgement_receipts: receipts, receipts: receiptDocs, receipt_particulars: items, ar_supporting_documents: sheets, ar_sheet_links: links, verification_events: events, financial_mutations: mutations, control_number_reservations: controls };
  }, { timeout: 30000 });
  const data: ArchiveData = JSON.parse(JSON.stringify(raw));
  let bytes = 0;
  const files = [];
  for (const scan of raw.document_scans) { const image = await readImage(scan.file_path); bytes += image.bytes.length; if (bytes > 250 * 1024 * 1024) throw new ApiError(413, "This archive exceeds the pilot's 250 MB raw-image limit. Use the documented full database/storage backup procedure."); files.push({ scan_id: scan.id, sha256: hash(image.bytes), bytes_base64: Buffer.from(image.bytes).toString("base64") }); }
  const manifest = { organization: "single-organization-pilot", term: termName, exported_at: new Date().toISOString(), exported_by: actorId, data_sha256: hash(JSON.stringify(data)), counts: Object.fromEntries(Object.entries(data).map(([table, rows]) => [table, rows.length])), scan_count: files.length, scope: "Selected term records and all their original scans; login credentials excluded", unassigned_legacy_scans_excluded: await prisma.documentScan.count({ where: { academic_year: null, id: { notIn: raw.document_scans.map(scan => scan.id) } } }), complete: true as const };
  const bundle: FinanceArchive = { format: "kyeruu-finance-archive-v1", manifest, manifest_sha256: hash(JSON.stringify(manifest)), data, files };
  await prisma.archiveExport.create({ data: { term: termName, user_id: actorId, manifest_sha256: bundle.manifest_sha256, scan_count: files.length } });
  return bundle;
}
