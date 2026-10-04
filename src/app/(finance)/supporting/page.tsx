"use client";
import { useOfficer } from "@/app/navigation";
import { canEditFinance } from "@/lib/capabilities";
import { useEffect, useState } from "react";
import { getJson, type OrphanDocument, type ScheduleGroup, type ScheduleOption, type Transaction } from "@/lib/client-types";

type Item = { name: string; quantity: string; unitCost: string; scheduleId: string; voucherId: string };
type Allocation = { receiptId: string; amount: string };
export default function SupportingPage() {
  const canEdit = canEditFinance(useOfficer());
  const [kind, setKind] = useState("RECEIPT");
  const [scans, setScans] = useState<OrphanDocument[]>([]);
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
  useEffect(() => {
    let active = true;
    Promise.all([getJson<OrphanDocument[]>("/api/documents/orphan"), getJson<ScheduleGroup[]>("/api/schedules"), getJson<Transaction[]>("/api/transactions/vouchers"), getJson<Transaction[]>("/api/transactions/receipts")])
      .then(([documents, groups, dvs, ars]) => {
        if (!active) return;
        setScans(documents.filter(document => document.kind === "SCAN"));
        setSchedules(groups.filter(group => !group.is_closed).flatMap(group => group.schedules));
        setVouchers(dvs); setReceipts(ars);
      }).catch(error => { if (active) setMessage(error instanceof Error ? error.message : "Could not load documents."); });
    return () => { active = false; };
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const body = kind === "RECEIPT" ? {
        kind, scan_id: scanId, internal_receipt_number: number, reference_number: reference, date, doc_type: docType,
        particulars: items.map(item => {
          const voucher = vouchers.find(record => String(record.id) === item.voucherId);
          return { particular_name: item.name, quantity: item.quantity, unit_cost: item.unitCost, schedule_id: item.scheduleId, ...(voucher ? { link: { transaction_id: voucher.id, version: voucher.version } } : {}) };
        }),
      } : {
        kind, scan_id: scanId, doc_type: docType, context_label: label, period_covered: period, total_amount: total,
        links: allocations.map(allocation => {
          const receipt = receipts.find(record => String(record.id) === allocation.receiptId);
          if (!receipt) throw new Error("Choose an acknowledgement receipt for each allocation.");
          return { transaction_id: receipt.id, version: receipt.version, amount_covered: allocation.amount };
        }),
      };
      const response = await fetch("/api/documents/supporting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save supporting document.");
      setScans(previous => previous.filter(scan => String(scan.scan_id) !== scanId)); setScanId("");
      const [dvs, ars] = await Promise.all([getJson<Transaction[]>("/api/transactions/vouchers"), getJson<Transaction[]>("/api/transactions/receipts")]);
      setVouchers(dvs); setReceipts(ars); setAllocations([]);
      setMessage("Supporting document saved. Check reconciliation for any remaining gaps.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Save failed."); }
    finally { setBusy(false); }
  }
  const input = "block border rounded p-2 w-full";
  return <main className="max-w-5xl mx-auto p-6 space-y-5"><h1 className="text-3xl font-bold">Supporting documents</h1>
    <p>Save the original image through OCR first, then record its receipt items or collection-sheet allocations here. Unlinked items remain in reconciliation.</p>
    {message && <p role="status">{message}</p>}
    <form onSubmit={save} className="space-y-4 bg-white border rounded-xl p-5">
      <fieldset disabled={!canEdit || busy} className="space-y-4"><label className="block">Document kind<select className={input} value={kind} onChange={event => { setKind(event.target.value); setDocType(event.target.value === "RECEIPT" ? "RETAILER_RECEIPT" : "COLLECTION_SHEET"); }}><option value="RECEIPT">Retail receipt / certificate of expenses</option><option value="SHEET">Collection / sales sheet</option></select></label>
      <label className="block">Unassigned scan<select required className={input} value={scanId} onChange={event => setScanId(event.target.value)}><option value="">Choose scan...</option>{scans.map(scan => <option key={scan.id} value={scan.scan_id}>Scan {scan.scan_id} - {new Date(scan.uploaded_at).toLocaleDateString()}</option>)}</select></label>
      <label className="block">Document type<select className={input} value={docType} onChange={event => setDocType(event.target.value)}>{(kind === "RECEIPT" ? ["RETAILER_RECEIPT", "CERTIFICATE_OF_EXPENSES"] : ["COLLECTION_SHEET", "SALES_SHEET"]).map(type => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
      {kind === "RECEIPT" ? <>
        <label>Internal receipt number<input required maxLength={50} className={input} value={number} onChange={event => setNumber(event.target.value)} /></label>
        <label>Reference number<input required maxLength={100} className={input} value={reference} onChange={event => setReference(event.target.value)} /></label>
        <label>Date<input required type="date" className={input} value={date} onChange={event => setDate(event.target.value)} /></label>
        <h2 className="font-bold">Receipt items</h2>{items.map((item,index) => <div key={index} className="border rounded p-3 grid sm:grid-cols-3 gap-3">
          {(["name", "quantity", "unitCost"] as const).map(field => <label key={field}>{field === "unitCost" ? "Unit cost" : field}<input required className={input} type={field === "name" ? "text" : "number"} min={field === "name" ? undefined : "0.01"} step={field === "name" ? undefined : "0.01"} value={item[field]} onChange={event => setItems(previous => previous.map((row,i) => i === index ? { ...row, [field]: event.target.value } : row))} /></label>)}
          <label>Outflow schedule<select required className={input} value={item.scheduleId} onChange={event => setItems(previous => previous.map((row,i) => i === index ? { ...row, scheduleId: event.target.value, voucherId: "" } : row))}><option value="">Choose schedule...</option>{schedules.filter(schedule => schedule.type === "OUTFLOW").map(schedule => <option key={schedule.id} value={schedule.id}>{schedule.label}</option>)}</select></label>
          <label>Voucher (optional)<select className={input} value={item.voucherId} onChange={event => setItems(previous => previous.map((row,i) => i === index ? { ...row, voucherId: event.target.value } : row))}><option value="">Link later</option>{vouchers.filter(voucher => String(voucher.schedule.id) === item.scheduleId).map(voucher => <option key={voucher.id} value={voucher.id}>{voucher.control_number}</option>)}</select></label>
          <button type="button" disabled={items.length === 1} onClick={() => setItems(previous => previous.filter((_,i) => i !== index))}>Remove item</button>
        </div>)}<button type="button" className="border rounded p-2" onClick={() => setItems(previous => [...previous, { name: "", quantity: "1", unitCost: "", scheduleId: "", voucherId: "" }])}>Add receipt item</button>
      </> : <>
        <label>Context / label<input required className={input} value={label} onChange={event => setLabel(event.target.value)} /></label>
        <label>Period covered<input className={input} value={period} onChange={event => setPeriod(event.target.value)} /></label>
        <label>Sheet total<input required type="number" min="0.01" step="0.01" className={input} value={total} onChange={event => setTotal(event.target.value)} /></label>
        <h2 className="font-bold">Allocations (optional)</h2>{allocations.map((allocation,index) => <div key={index} className="grid sm:grid-cols-3 gap-3 border rounded p-3">
          <label>Acknowledgement receipt<select required className={input} value={allocation.receiptId} onChange={event => setAllocations(previous => previous.map((row,i) => i === index ? { ...row, receiptId: event.target.value } : row))}><option value="">Choose receipt...</option>{receipts.filter(receipt => schedules.some(schedule => schedule.id === receipt.schedule.id)).map(receipt => <option key={receipt.id} value={receipt.id}>{receipt.control_number}</option>)}</select></label>
          <label>Amount covered<input required type="number" min="0.01" step="0.01" className={input} value={allocation.amount} onChange={event => setAllocations(previous => previous.map((row,i) => i === index ? { ...row, amount: event.target.value } : row))} /></label>
          <button type="button" onClick={() => setAllocations(previous => previous.filter((_,i) => i !== index))}>Remove allocation</button>
        </div>)}<button type="button" className="border rounded p-2" onClick={() => setAllocations(previous => [...previous, { receiptId: "", amount: "" }])}>Add allocation</button>
      </>}
      <button disabled={!canEdit || busy || !scanId} className="block rounded bg-blue-600 text-white px-4 py-2 disabled:opacity-50">{busy ? "Saving..." : "Save supporting document"}</button>
    </fieldset></form>
  </main>;
}
