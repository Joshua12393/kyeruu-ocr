export interface UserOption { id: number; name: string; }
export interface Scan { id: number; file_path: string; uploaded_at: string; }
export interface OrphanDocument extends Scan { document_version?: number; remaining?: string; schedule_id?: number; read_only?: boolean; academic_year?: string | null; kind: "SCAN" | "PARTICULAR" | "SHEET"; scan_id: number; }
export interface ScheduleOption { id: number; type: "INFLOW" | "OUTFLOW"; label: string; summary?: { records: number; incomplete: number; mismatched: number; unverified: number; unlinked_items: number }; group?: { academic_year: string; is_closed: boolean }; }
export interface ScheduleGroup { id: number; schedule_number: string; activity_type: "IGP" | "MEMBERSHIP" | "FINES" | "EVENTS"; academic_year: string; semester: "FIRST" | "SECOND" | "SUMMER"; is_closed: boolean; schedules: ScheduleOption[]; }
export interface Transaction {
  id: number; control_number: string; date: string; purpose: string; amount: string;
  schedule: ScheduleOption; released_to?: UserOption; remitted_by?: UserOption;
  support_total?: string; difference?: string; form_of_payment: "CASH" | "E_WALLET"; is_verified: boolean; version: number; scan_file?: Scan | null;
}
export interface ArchiveTransaction extends Transaction { type: "DV" | "AR"; }
export interface ReconciliationData {
  summary: { total_incomplete: number; total_mismatches: number };
  incomplete: { vouchers: Transaction[]; receipts: Transaction[] };
  mismatches: { vouchers: Transaction[]; receipts: Transaction[] };
}
export interface OcrResult {
  pipeline: "printed" | "handwritten"; raw_text: string; overall_confidence: number;
  fields: { field_name: string; value: string; confidence: number }[];
  line_items: { particular: string; quantity?: number | null; unit_cost?: number | null; amount: number; confidence: number }[];
}
export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data as T;
}

export function responseError(result: { error?: string; details?: { path: PropertyKey[]; message: string }[] }) { return result.details?.length ? result.details.map(issue => issue.path.join(".") + ": " + issue.message).join("; ") : result.error || "Request failed."; }
