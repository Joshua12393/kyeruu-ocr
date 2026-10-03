"use client";
import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { OcrResult } from "@/lib/client-types";

export default function OcrInterface() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [pipeline, setPipeline] = useState("printed");
  const [busy, setBusy] = useState(false);
  const [scanId, setScanId] = useState<number | null>(null);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  async function extract(manual = false) {
    if (!file) return;
    setBusy(true); setError(""); setResult(null); setScanId(null); setFields({});
    const form = new FormData();
    form.append("file", file); form.append("pipeline", manual ? "manual" : pipeline);
    try {
      const response = await fetch("/api/ocr/process", { method: "POST", body: form });
      const data = await response.json() as { scanId?: number; extractedData?: OcrResult; error?: string };
      if (data.scanId) setScanId(data.scanId);
      if (!response.ok) throw new Error(data.error || "Extraction failed.");
      if (data.extractedData) {
        setResult(data.extractedData);
        setFields(Object.fromEntries(data.extractedData.fields.map(field => [field.field_name, field.value])));
      }
    } catch (error) { setError(error instanceof Error ? error.message : "Extraction failed."); }
    finally { setBusy(false); }
  }
  function create(kind: "vouchers" | "receipts") {
    if (!scanId) return;
    sessionStorage.setItem("ocr-transaction-draft", JSON.stringify({ scanId, fields }));
    router.push(`/transactions/${kind}`);
  }
  return <main className="max-w-6xl mx-auto p-6 space-y-6">
    <h1 className="text-3xl font-bold">Document OCR</h1>
    <p>Upload a printed receipt or handwritten financial document. Review every extracted value before saving.</p>
    <div className="grid md:grid-cols-2 gap-6">
      <section className="border rounded-xl p-5 space-y-4">
        <label className="block">Document image (PNG, JPEG, WebP; up to 10 MB)
          <input className="block mt-2" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => { setFile(event.target.files?.[0] || null); setResult(null); setScanId(null); setFields({}); setError(""); }} />
        </label>
        <label className="block">Document type
          <select className="block border p-2 mt-2" disabled={busy} value={pipeline} onChange={event => setPipeline(event.target.value)}>
            <option value="printed">Printed receipt</option><option value="handwritten">Handwritten DV / AR</option>
          </select>
        </label>
        <p className="text-sm text-gray-600">Handwriting recognition may be less reliable. Manual entry is available.</p>
        <div className="flex gap-3"><button className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50" disabled={!file || busy} onClick={() => extract()}>{busy ? "Processing-" : "Extract text"}</button>
          <button className="border rounded px-4 py-2 disabled:opacity-50" disabled={!file || busy} onClick={() => extract(true)}>Save scan for manual entry</button></div>
        {error && <p role="alert" className="text-red-700">{error}</p>}
        {scanId && <Image unoptimized width={800} height={1000} src={`/api/storage?scanId=${scanId}`} alt="Original scan" className="w-full h-auto" />}
      </section>
      <section className="border rounded-xl p-5 space-y-4">
        <h2 className="font-bold text-xl">Review extraction</h2>
        {result && <p>Recognition confidence: {(result.overall_confidence * 100).toFixed(0)}%. This measures recognized text, not financial accuracy.</p>}
        {scanId ? <>
          {["control_number", "date", "purpose", "amount"].map(name => <label key={name} className="block">{name.replaceAll("_", " ")}
            <input className="block w-full border rounded p-2" type={name === "date" ? "date" : "text"} value={fields[name] || ""} onChange={event => setFields(previous => ({ ...previous, [name]: event.target.value }))} />
            {result?.fields.find(field => field.field_name === name && field.confidence < .8) && <span className="text-amber-700 text-sm">Low confidence - check against the scan.</span>}
          </label>)}
          {!!result?.line_items.length && <div><h3 className="font-semibold">Detected receipt rows</h3>{result.line_items.map((item,index) => <p key={index}>{item.particular}: PHP {item.amount.toFixed(2)} ({(item.confidence * 100).toFixed(0)}%)</p>)}</div>}
          {result && <details><summary>Recognized text</summary><pre className="whitespace-pre-wrap">{result.raw_text}</pre></details>}
          <div className="flex gap-3"><button className="border rounded px-3 py-2" onClick={() => create("vouchers")}>Create voucher</button><button className="border rounded px-3 py-2" onClick={() => create("receipts")}>Create acknowledgement receipt</button></div>
          <p className="text-sm text-gray-600">These buttons open a draft. Nothing is recorded as a transaction until you complete and submit its form.</p>
        </> : <p>Extract text or save a scan to begin reviewing.</p>}
      </section>
    </div>
  </main>;
}
