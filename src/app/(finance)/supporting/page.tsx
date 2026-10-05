"use client";
import { useOfficer } from "@/app/navigation";
import { canEditFinance } from "@/lib/capabilities";
import { DRAFT_KEY, draftSchema } from "@/lib/ocr-draft";
import ItemSuggestions from "@/app/item-suggestions";
import ManualScanPicker from "@/app/manual-scan-picker";
import { useEffect, useState, useCallback, useRef } from "react";
import { getJson, type ScheduleGroup, type ScheduleOption, type Transaction, responseError } from "@/lib/client-types";

type Item = { recognizedAmount?: string; id?: number; name: string; quantity: string; unitCost: string; scheduleId: string; voucherId: string };
type Saved = { source_read_only?: boolean; id: number; version: number; academic_year: string | null; scan_file_id: number; doc_type: string; internal_receipt_number?: string; reference_number?: string; date?: string; context_label?: string; period_covered?: string; total_amount?: string; particulars?: { id: number; particular_name: string; quantity: string; unit_cost: string; schedule_id: number; dv_id: number | null; schedule: ScheduleOption }[]; ar_sheet_links?: { ar_id: number; amount_covered: string; acknowledgement_receipt: Transaction }[] };
type Allocation = { receiptId: string; amount: string };
export default function SupportingPage() {
  const officer = useOfficer();
  const canEdit = canEditFinance(officer);
  const initialized = useRef(false);
  const [kind, setKind] = useState("RECEIPT");

  const [schedules, setSchedules] = useState<ScheduleOption[]>([]);
  const [vouchers, setVouchers] = useState<Transaction[]>([]);
  const [receipts, setReceipts] = useState<Transaction[]>([]);
  const [scanId, setScanId] = useState("");
  const [number, setNumber] = useState("");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0,10));
  const [label, setLabel] = useState("");
  const [period, setPeriod] = useState("");
  const [total, setTotal] = useState("");
  const [docType, setDocType] = useState("RETAILER_RECEIPT");
  const [items, setItems] = useState<Item[]>([{ name: "", quantity: "1", unitCost: "", scheduleId: "", voucherId: "" }]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ receipts: Saved[]; sheets: Saved[] }>({ receipts: [], sheets: [] });
  const [editing, setEditing] = useState<Saved | null>(null);
  const [parentVersions, setParentVersions] = useState<{ type: "DV" | "AR"; id: number; version: number }[]>([]);
  const [conflict, setConflict] = useState<Saved | null>(null);
  const editable = canEdit && (!editing || (!editing.source_read_only && editing.academic_year === officer?.term && !(editing.particulars?.some(item => item.schedule.group?.is_closed) || editing.ar_sheet_links?.some(link => link.acknowledgement_receipt.schedule.group?.is_closed))));
  const load = useCallback(() => Promise.all([getJson<ScheduleGroup[]>("/api/schedules"), getJson<Transaction[]>("/api/transactions/vouchers"), getJson<Transaction[]>("/api/transactions/receipts"), getJson<{ receipts: Saved[]; sheets: Saved[] }>("/api/documents/supporting")]).then(([groups, dvs, ars, documents]) => { setSchedules(groups.filter(group => !group.is_closed && group.academic_year === officer?.term).flatMap(group => group.schedules)); setVouchers(dvs); setReceipts(ars); setSaved(documents); return { documents, dvs, ars }; }), [officer?.term]);
  const edit = useCallback((document: Saved, type: string, dvs: Transaction[], ars: Transaction[]) => {
    setEditing(document); setKind(type); setDocType(document.doc_type); setScanId(String(document.scan_file_id)); setConflict(null); setMessage("");
    setNumber(document.internal_receipt_number || ""); setReference(document.reference_number || ""); setDate(document.date?.slice(0,10) || new Date().toISOString().slice(0,10));
    setLabel(document.context_label || ""); setPeriod(document.period_covered || ""); setTotal(document.total_amount || "");
    setItems(document.particulars?.map(row => ({ id: row.id, name: row.particular_name, quantity: row.quantity, unitCost: row.unit_cost, scheduleId: String(row.schedule_id), voucherId: row.dv_id ? String(row.dv_id) : "" })) || [{ name: "", quantity: "1", unitCost: "", scheduleId: "", voucherId: "" }]);
    setAllocations(document.ar_sheet_links?.map(link => ({ receiptId: String(link.ar_id), amount: link.amount_covered })) || []);
    setParentVersions(type === "RECEIPT" ? dvs.filter(row => document.particulars?.some(item => item.dv_id === row.id)).map(row => ({ type: "DV" as const, id: row.id, version: row.version })) : ars.filter(row => document.ar_sheet_links?.some(link => link.ar_id === row.id)).map(row => ({ type: "AR" as const, id: row.id, version: row.version })));
  }, []);
  useEffect(() => {
    load().then(({ documents, dvs, ars }) => {
      if (initialized.current) return; initialized.current = true;
      const params = new URLSearchParams(window.location.search); const id = Number(params.get("id")); const type = params.get("kind");
      const document = (type === "SHEET" ? documents.sheets : documents.receipts).find(row => row.id === id);
      if (document) { edit(document, type === "SHEET" ? "SHEET" : "RECEIPT", dvs, ars); return; }
      const stored = sessionStorage.getItem(DRAFT_KEY); if (!stored) return;
      const draft = draftSchema.parse(JSON.parse(stored)); if (!["RECEIPT", "SHEET"].includes(draft.kind)) return;
      setKind(draft.kind); setDocType(draft.documentType); setScanId(String(draft.scanId)); setReference(draft.fields.control_number || ""); setNumber(""); setDate(draft.fields.date || new Date().toISOString().slice(0,10)); setLabel(draft.fields.purpose || ""); setTotal(draft.fields.amount || "");
      setItems(draft.items.length ? draft.items.map(item => ({ name: item.particular, quantity: item.quantity == null ? "" : String(item.quantity), unitCost: item.unit_cost == null ? "" : String(item.unit_cost), recognizedAmount: String(item.amount), scheduleId: String(item.scheduleId || draft.scheduleId), voucherId: draft.parentId && (item.scheduleId || draft.scheduleId) === draft.scheduleId ? String(draft.parentId) : "" })) : [{ name: "", quantity: "", unitCost: "", scheduleId: String(draft.scheduleId), voucherId: draft.parentId ? String(draft.parentId) : "" }]);
      if (draft.parentId && draft.parentVersion) { setParentVersions([{ type: draft.kind === "RECEIPT" ? "DV" : "AR", id: draft.parentId, version: draft.parentVersion }]); if (draft.kind === "SHEET") setAllocations([{ receiptId: String(draft.parentId), amount: "" }]); }
      setMessage("Reviewed OCR draft loaded. Enter missing quantity/unit cost and confirm every item. No transaction has been saved."); sessionStorage.removeItem(DRAFT_KEY);
    }).catch(error => setMessage(error.message));
  }, [load,edit]);
  function startNew() { setEditing(null); setConflict(null); setScanId(""); setNumber(""); setReference(""); setLabel(""); setPeriod(""); setTotal(""); setItems([{ name: "", quantity: "1", unitCost: "", scheduleId: "", voucherId: "" }]); setAllocations([]); setParentVersions([]); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const body = kind === "RECEIPT" ? {
        kind, version: editing?.version, parent_versions: parentVersions, scan_id: scanId, internal_receipt_number: number, reference_number: reference, date, doc_type: docType,
        particulars: items.map(item => {
          const voucher = vouchers.find(record => String(record.id) === item.voucherId);
          return { ...(item.id ? { id: item.id } : {}), particular_name: item.name, quantity: item.quantity, unit_cost: item.unitCost, schedule_id: item.scheduleId, ...(voucher ? { link: { transaction_id: voucher.id, version: parentVersions.find(row => row.type === "DV" && row.id === voucher.id)?.version || voucher.version } } : {}) };
        }),
      } : {
        kind, version: editing?.version, parent_versions: parentVersions, scan_id: scanId, doc_type: docType, context_label: label, period_covered: period, total_amount: total,
        links: allocations.map(allocation => {
          const receipt = receipts.find(record => String(record.id) === allocation.receiptId);
          if (!receipt) throw new Error("Choose an acknowledgement receipt for each allocation.");
          return { transaction_id: receipt.id, version: parentVersions.find(row => row.type === "AR" && row.id === receipt.id)?.version || receipt.version, amount_covered: allocation.amount };
        }),
      };
      const response = await fetch(editing ? `/api/documents/supporting/${editing.id}` : "/api/documents/supporting", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) { if (result.code === "VERSION_CONFLICT") setConflict({ ...(editing || result.current), version: result.current_version }); throw new Error(responseError(result)); }
      await load(); startNew();
      setMessage("Supporting document saved. Check reconciliation for any remaining gaps.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Save failed."); }
    finally { setBusy(false); }
  }
  const availableSchedules = [...schedules, ...(editing?.particulars?.map(item => item.schedule) || [])].filter((side, index, rows) => rows.findIndex(row => row.id === side.id) === index);
  const input = "block border rounded p-2 w-full";
  return <main className="max-w-5xl mx-auto p-6 space-y-5"><h1 className="text-3xl font-bold">Supporting documents</h1>
    <p>Upload an original image and enter its values manually, or use an existing OCR scan. Saved items and allocations can be edited, unlinked, or reassigned. Changes clear affected verification.</p>
    {message && <p role="status">{message}</p>}
    {conflict && <div className="bg-amber-50 border p-3">Latest affected record version: {conflict.version}. Your draft is still here. <button type="button" className="underline" onClick={async () => { try { const [documents, dvs, ars] = await Promise.all([getJson<{ receipts: Saved[]; sheets: Saved[] }>("/api/documents/supporting"), getJson<Transaction[]>("/api/transactions/vouchers"), getJson<Transaction[]>("/api/transactions/receipts")]); const row = (kind === "RECEIPT" ? documents.receipts : documents.sheets).find(row => row.id === editing?.id); if (confirm(editing ? "Replace your draft with the latest saved document and transaction versions?" : "Refresh transaction versions while keeping this unsaved draft?")) { setVouchers(dvs); setReceipts(ars); setSaved(documents); if (row) edit(row, kind, dvs, ars); else { setParentVersions([]); setConflict(null); } } } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load latest values."); } }}>Review and load latest</button></div>}
    <section className="bg-white border rounded-xl p-4 space-y-3"><div className="flex justify-between"><h2 className="font-bold">Saved supporting documents</h2><button type="button" className="text-blue-600 underline" onClick={startNew}>New document</button></div>{[...saved.receipts.map(row => ({ row, type: "RECEIPT" })), ...saved.sheets.map(row => ({ row, type: "SHEET" }))].map(({ row, type }) => <div key={type + row.id} className="flex justify-between border-t py-2"><span>{row.internal_receipt_number || row.context_label} · {row.academic_year || "Legacy"} · version {row.version}</span><button type="button" className="underline text-blue-600" onClick={() => edit(row, type, vouchers, receipts)}>View / edit</button></div>)}{!saved.receipts.length && !saved.sheets.length && <p>No supporting documents saved yet.</p>}</section>
    {editing && <p>Editing {editing.internal_receipt_number || editing.context_label}, version {editing.version}. {!editable && "Historical, closed, or restricted documents are read-only."}</p>}
    <form onSubmit={save} className="space-y-4 bg-white border rounded-xl p-5">
      <fieldset disabled={!editable || busy} className="space-y-4"><label className="block">Document kind<select disabled={!!editing} className={input} value={kind} onChange={event => { setKind(event.target.value); setDocType(event.target.value === "RECEIPT" ? "RETAILER_RECEIPT" : "COLLECTION_SHEET"); }}><option value="RECEIPT">Retail receipt / certificate of expenses</option><option value="SHEET">Collection / sales sheet</option></select></label>
      <ManualScanPicker key={editing ? kind + editing.id : "new"} required value={scanId} onChange={setScanId} />
      <label className="block">Document type<select className={input} value={docType} onChange={event => setDocType(event.target.value)}>{(kind === "RECEIPT" ? ["RETAILER_RECEIPT", "CERTIFICATE_OF_EXPENSES"] : ["COLLECTION_SHEET", "SALES_SHEET"]).map(type => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
      {kind === "RECEIPT" ? <>
        <label>Internal receipt number<input required maxLength={50} className={input} value={number} onChange={event => setNumber(event.target.value)} /></label>
        <label>Reference number<input required maxLength={100} className={input} value={reference} onChange={event => setReference(event.target.value)} /></label>
        <label>Date<input required min={officer?.term_start || undefined} max={officer?.term_end || undefined} type="date" className={input} value={date} onChange={event => setDate(event.target.value)} /></label>
        <h2 className="font-bold">Receipt items</h2>{items.map((item,index) => <div key={index} className="border rounded p-3 grid sm:grid-cols-3 gap-3">
          {item.recognizedAmount && <p className="text-xs sm:col-span-3">OCR line total: PHP {item.recognizedAmount}. Quantity and unit cost require confirmation; they are never inferred from this total.</p>}{(["name", "quantity", "unitCost"] as const).map(field => <label key={field}>{field === "unitCost" ? "Unit cost" : field}<input required className={input} type={field === "name" ? "text" : "number"} min={field === "name" ? undefined : "0.01"} step={field === "name" ? undefined : "0.01"} value={item[field]} onChange={event => setItems(previous => previous.map((row,i) => i === index ? { ...row, [field]: event.target.value } : row))} /></label>)}
          <label>Outflow schedule<select required className={input} value={item.scheduleId} onChange={event => setItems(previous => previous.map((row,i) => i === index ? { ...row, scheduleId: event.target.value, voucherId: "" } : row))}><option value="">Choose schedule...</option>{availableSchedules.filter(schedule => schedule.type === "OUTFLOW").map(schedule => <option key={schedule.id} value={schedule.id}>{schedule.label}</option>)}</select></label>
          <ItemSuggestions name={item.name} onChoose={id => setItems(previous => previous.map((row,i) => i === index ? { ...row,scheduleId: id,voucherId: "" } : row))} />
          <label>Voucher (optional)<select className={input} value={item.voucherId} onChange={event => setItems(previous => previous.map((row,i) => i === index ? { ...row, voucherId: event.target.value } : row))}><option value="">Link later</option>{vouchers.filter(voucher => String(voucher.schedule.id) === item.scheduleId).map(voucher => <option key={voucher.id} value={voucher.id}>{voucher.control_number}</option>)}</select></label>
          <button type="button" disabled={items.length === 1} onClick={() => setItems(previous => previous.filter((_,i) => i !== index))}>Remove item</button>
        </div>)}<button type="button" className="border rounded p-2" onClick={() => setItems(previous => [...previous, { name: "", quantity: "1", unitCost: "", scheduleId: "", voucherId: "" }])}>Add receipt item</button>
      </> : <>
        <label>Context / label<input required className={input} value={label} onChange={event => setLabel(event.target.value)} /></label>
        <label>Period covered<input className={input} value={period} onChange={event => setPeriod(event.target.value)} /></label>
        <label>Sheet total<input required type="number" min="0.01" step="0.01" className={input} value={total} onChange={event => setTotal(event.target.value)} /></label>
        <h2 className="font-bold">Allocations (optional)</h2>{allocations.map((allocation,index) => <div key={index} className="grid sm:grid-cols-3 gap-3 border rounded p-3">
          <label>Acknowledgement receipt<select required className={input} value={allocation.receiptId} onChange={event => setAllocations(previous => previous.map((row,i) => i === index ? { ...row, receiptId: event.target.value } : row))}><option value="">Choose receipt...</option>{receipts.filter(receipt => schedules.some(schedule => schedule.id === receipt.schedule.id) || editing?.ar_sheet_links?.some(link => link.ar_id === receipt.id)).map(receipt => <option key={receipt.id} value={receipt.id}>{receipt.control_number}</option>)}</select></label>
          <label>Amount covered<input required type="number" min="0.01" step="0.01" className={input} value={allocation.amount} onChange={event => setAllocations(previous => previous.map((row,i) => i === index ? { ...row, amount: event.target.value } : row))} /></label>
          <button type="button" onClick={() => setAllocations(previous => previous.filter((_,i) => i !== index))}>Remove allocation</button>
        </div>)}<button type="button" className="border rounded p-2" onClick={() => setAllocations(previous => [...previous, { receiptId: "", amount: "" }])}>Add allocation</button>
      </>}
      <button disabled={!editable || busy || !scanId} className="block rounded bg-blue-600 text-white px-4 py-2 disabled:opacity-50">{busy ? "Saving..." : editing ? "Save changes" : "Save supporting document"}</button>
    </fieldset></form>
  </main>;
}
