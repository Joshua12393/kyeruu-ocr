"use client";
import { canEditFinance } from "@/lib/capabilities";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Check, ChevronRight, FileImage, FileText, LoaderCircle, ScanLine, ShieldCheck, UploadCloud, X, ZoomIn, ZoomOut } from "lucide-react";
import type { OcrResult } from "@/lib/client-types";
import { useOfficer } from "@/app/navigation";

const definitions = [{ name: "control_number", label: "Control / reference number", placeholder: "e.g. DV-2026-001" }, { name: "date", label: "Document date", placeholder: "" }, { name: "purpose", label: "Purpose / description", placeholder: "Describe this transaction" }, { name: "amount", label: "Total amount (PHP)", placeholder: "0.00" }];

export default function OcrWorkspace() {
  const router = useRouter();
  const officer = useOfficer();
  const canEdit = canEditFinance(officer);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState("printed");
  const [busy, setBusy] = useState(false);
  const [scanId, setScanId] = useState<number | null>(null);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState(100);
  const [dragging, setDragging] = useState(false);
  const objectUrl = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);
  function selectFile(next: File | null) {
    if (busy) return;
    setError("");
    if (next && !["image/png", "image/jpeg", "image/webp"].includes(next.type)) { setError("Choose a PNG, JPEG, or WebP image."); return; }
    if (next && next.size > 10 * 1024 * 1024) { setError("This image is too large. Choose a file under 10 MB."); return; }
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = next ? URL.createObjectURL(next) : null;
    setPreview(objectUrl.current); setFile(next); setResult(null); setScanId(null); setFields({}); setZoom(100);
    if (!next && inputRef.current) inputRef.current.value = "";
  }
  async function extract(manual = false) {
    if (!file || busy || !canEdit) return;
    setBusy(true); setError(""); setResult(null); setScanId(null); setFields({});
    const form = new FormData(); form.append("file", file); form.append("pipeline", manual ? "manual" : pipeline);
    try {
      const response = await fetch("/api/ocr/process", { method: "POST", body: form });
      const data = await response.json() as { scanId?: number; extractedData?: OcrResult; error?: string };
      if (data.scanId) setScanId(data.scanId);
      if (!response.ok) throw new Error(data.error || "Extraction failed.");
      if (data.extractedData) { setResult(data.extractedData); setFields(Object.fromEntries(data.extractedData.fields.map(field => [field.field_name, field.value]))); }
    } catch (error) { setError(error instanceof Error ? error.message : "Extraction failed."); }
    finally { setBusy(false); }
  }
  function create(kind: "vouchers" | "receipts") {
    if (!scanId || busy || !canEdit) return;
    try { sessionStorage.setItem("ocr-transaction-draft", JSON.stringify({ scanId, fields })); router.push(`/transactions/${kind}`); }
    catch { setError("Your browser could not save the draft. Enable session storage and try again."); }
  }
  const source = preview || (scanId ? `/api/storage?scanId=${scanId}` : null);
  const confidence = result ? Math.round(result.overall_confidence * 100) : null;
  const reviewedCount = definitions.filter(field => fields[field.name]?.trim()).length;
  return <main className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight">Document OCR</h1><p className="mt-1.5 text-sm text-gray-500">Turn a document into a draft. Review each value before recording it.</p></div><Link href="/supporting" className="finance-secondary"><FileText size={16} /> Supporting documents <ArrowRight size={16} /></Link></div>
    <ol aria-label="Document workflow" className="flex flex-wrap items-center gap-3 text-xs sm:text-sm">{[{ title: "Upload document", done: !!file, active: !scanId }, { title: "Review extraction", done: !!result, active: !!scanId }, { title: "Create transaction", done: false, active: false }].map((step,index) => <li key={step.title} className="flex items-center gap-3"><span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${step.done ? "bg-brand-500 text-white" : step.active ? "bg-brand-50 text-brand-500" : "bg-gray-100 text-gray-400"}`}>{step.done ? <Check size={14} /> : index + 1}</span><span className={step.active || step.done ? "font-medium text-gray-700" : "text-gray-400"}>{step.title}</span>{index < 2 && <ChevronRight size={15} className="text-gray-300" />}</li>)}</ol>
    {!canEdit && <div className="flex gap-3 rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm text-gray-700"><ShieldCheck size={20} className="shrink-0 text-brand-500" /><div><p className="font-semibold">You have viewing access</p><p className="mt-1 leading-6">You can preview a document here. Uploading scans, extracting text, and creating drafts require an Adviser, President, Treasurer, or Assistant Treasurer account with an active calendar.</p></div></div>}
    {error && <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle size={20} className="shrink-0" /><p>{error}</p></div>}
    <div className="grid items-start gap-6 xl:grid-cols-[1.1fr_1fr]">
      <section className="finance-card min-w-0 overflow-hidden" aria-labelledby="preview-title">
        <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 id="preview-title" className="font-semibold">Document preview</h2><p className="mt-1 text-xs text-gray-500">PNG, JPEG, or WebP · Up to 10 MB</p></div><span className="rounded-lg bg-gray-50 p-2 text-gray-400"><FileImage size={20} /></span></div>
        <div className="space-y-4 p-5">
          <div onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files[0] || null); }} className={`relative rounded-xl border-2 border-dashed p-5 text-center transition ${dragging ? "border-brand-500 bg-brand-50" : "border-gray-200 bg-gray-50/50"}`}>
            <input ref={inputRef} id="ocr-image" className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => selectFile(event.target.files?.[0] || null)} />
            <label htmlFor="ocr-image" className={`flex flex-col items-center gap-2 ${busy ? "cursor-wait" : "cursor-pointer"}`}><span className="rounded-xl border bg-white p-2.5 text-brand-500"><UploadCloud size={23} /></span><span className="text-sm font-semibold"><span className="text-brand-500">Click to choose</span> or drag an image here</span><span className="text-xs text-gray-500">{file ? "Choose a different document to start a new extraction" : "Use a clear, well-lit image with the whole document visible"}</span></label>
          </div>
          {file && <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5"><FileImage size={19} className="shrink-0 text-brand-500" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file.name}</p><p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB {scanId ? `· Saved scan #${scanId}` : "· Local preview"}</p></div><button disabled={busy} aria-label="Remove selected document" onClick={() => selectFile(null)} className="rounded p-1.5 text-gray-400 hover:bg-gray-50"><X size={17} /></button></div>}
          <div className="flex items-center justify-between gap-3"><label htmlFor="document-type" className="text-sm font-medium">Document type</label><select id="document-type" className="finance-input max-w-55" disabled={busy} value={pipeline} onChange={event => setPipeline(event.target.value)}><option value="printed">Printed receipt</option><option value="handwritten">Handwritten document</option></select></div>
          {pipeline === "handwritten" && <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">Handwriting can be difficult to recognize. Check the original closely, or save the scan for manual entry.</p>}
          <div className="overflow-hidden rounded-xl border bg-gray-100"><div className="flex items-center justify-between border-b bg-white px-3 py-2"><span className="text-xs font-medium text-gray-500">Original document</span><div className="flex items-center gap-2"><button title="Zoom out" aria-label="Zoom out" disabled={!source || zoom <= 50} onClick={() => setZoom(value => Math.max(50,value - 25))} className="rounded p-1.5 text-gray-500 disabled:opacity-30"><ZoomOut size={17} /></button><button disabled={!source} title="Reset zoom" className="w-12 text-center text-xs tabular-nums text-gray-500" onClick={() => setZoom(100)}>{zoom}%</button><button title="Zoom in" aria-label="Zoom in" disabled={!source || zoom >= 200} onClick={() => setZoom(value => Math.min(200,value + 25))} className="rounded p-1.5 text-gray-500 disabled:opacity-30"><ZoomIn size={17} /></button></div></div>
            <div className="h-[420px] overflow-auto p-4 sm:h-[520px]">{source ? <div style={{ width: `${zoom}%`, minWidth: `${zoom}%` }} className="mx-auto"><Image unoptimized width={800} height={1100} src={source} alt={file ? `Preview of ${file.name}` : "Saved original document"} className="h-auto w-full rounded bg-white shadow-sm" onError={() => setError("The preview could not load. Choose a valid image or check your connection.")} /></div> : <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-gray-400"><FileImage size={48} strokeWidth={1} /><p className="text-sm">Your document preview will appear here</p><p className="max-w-60 text-xs leading-5">Keep the original beside your extracted values as you review.</p></div>}</div>
          </div>
          <div className="flex flex-wrap gap-3"><button className="finance-primary flex-1" disabled={!file || busy || !canEdit} onClick={() => extract()}>{busy ? <LoaderCircle className="animate-spin" size={18} /> : <ScanLine size={18} />}{busy ? "Processing document…" : "Extract text"}</button><button className="finance-secondary" disabled={!file || busy || !canEdit} onClick={() => extract(true)}>Manual entry</button></div>
          <p role="status" aria-live="polite" className="text-xs leading-5 text-gray-500">{busy ? "Reading your document. Please keep this page open." : "Manual entry saves the image and lets you fill in the values yourself."}</p>
        </div>
      </section>
      <section className="finance-card min-w-0 overflow-hidden" aria-labelledby="review-title">
        <div className="flex items-center justify-between gap-2 border-b px-5 py-4"><div><h2 id="review-title" className="font-semibold">Review extracted values</h2><p className="mt-1 text-xs text-gray-500">Correct anything that differs from the original</p></div>{scanId && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">Scan saved</span>}</div>
        <div className="space-y-6 p-5 sm:p-6">
          {result ? <div className="rounded-xl border bg-gray-50 p-4"><div className="flex items-center justify-between"><span className="text-sm font-medium">Text recognition confidence</span><span className={`text-sm font-semibold ${confidence! < 80 ? "text-amber-700" : "text-emerald-700"}`}>{confidence}%</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full bg-brand-500" style={{ width: `${confidence}%` }} /></div><p className="mt-3 text-xs leading-5 text-gray-500">This reflects text recognition, not accounting accuracy. Always compare the amounts and dates.</p></div> : <div role="status" className="flex items-start gap-3 rounded-xl bg-gray-50 p-4"><ScanLine size={20} className="shrink-0 text-gray-400" /><p className="text-sm leading-6 text-gray-500">{busy ? "Extracting text… your values will appear here when processing finishes." : scanId ? "Your scan is saved. Enter values below using the original document." : "Select a document and extract its text to start reviewing, or choose manual entry."}</p></div>}
          <div className="space-y-5">{definitions.map(({ name,label,placeholder }) => {
            const recognized = result?.fields.find(field => field.field_name === name);
            const uncertain = !!result && (!recognized || recognized.confidence < .8);
            return <div key={name}><div className="mb-2 flex items-center justify-between gap-2"><label htmlFor={`field-${name}`} className="text-sm font-medium">{label}</label>{uncertain && <span className="flex items-center gap-1 text-xs text-amber-700"><AlertCircle size={13} /> Check original</span>}</div>{name === "purpose" ? <textarea id={`field-${name}`} rows={3} className="finance-input resize-y" disabled={!scanId || busy || !canEdit} placeholder={placeholder} value={fields[name] || ""} onChange={event => setFields(previous => ({ ...previous,[name]: event.target.value }))} /> : <input id={`field-${name}`} className="finance-input" disabled={!scanId || busy || !canEdit} type={name === "date" ? "date" : "text"} inputMode={name === "amount" ? "decimal" : undefined} placeholder={placeholder} value={fields[name] || ""} onChange={event => setFields(previous => ({ ...previous,[name]: event.target.value }))} />}</div>;
          })}</div>
          {!!result?.line_items.length && <div><h3 className="mb-3 text-sm font-semibold">Detected receipt items</h3><div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="px-3 py-2 font-medium">Item</th><th className="px-3 py-2 text-right font-medium">Amount (PHP)</th></tr></thead><tbody>{result.line_items.map((item,index) => <tr key={index} className="border-t"><td className="px-3 py-3">{item.particular}{item.confidence < .8 && <p className="mt-1 text-xs text-amber-700">Check original</p>}</td><td className="px-3 py-3 text-right tabular-nums">{item.amount.toFixed(2)}</td></tr>)}</tbody></table></div><p className="mt-2 text-xs text-gray-500">Record item details in Supporting documents after reviewing the scan.</p></div>}
          {result && <details className="rounded-lg border px-4 py-3"><summary className="cursor-pointer text-sm font-medium text-gray-600">Show recognized text</summary><pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-gray-500">{result.raw_text}</pre></details>}
          <div className="border-t pt-5"><div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-semibold">Continue to a transaction</h3><span className="text-xs text-gray-400">{reviewedCount} / 4 fields filled</span></div><div className="grid gap-3 sm:grid-cols-2"><button className="finance-primary" disabled={!scanId || busy || !canEdit} onClick={() => create("vouchers")}>Create voucher <ArrowRight size={16} /></button><button className="finance-secondary" disabled={!scanId || busy || !canEdit} onClick={() => create("receipts")}>Create receipt <ArrowRight size={16} /></button></div><p className="mt-3 text-xs leading-5 text-gray-500">This opens an editable draft with your reviewed values and scan attached. Complete the transaction form to save the record.</p></div>
        </div>
      </section>
    </div>
  </main>;
}
