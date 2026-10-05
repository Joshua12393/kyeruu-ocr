"use client";
import { useEffect, useState } from "react";
import { getJson, type OrphanDocument } from "@/lib/client-types";
export default function ManualScanPicker({ value, onChange, required = false }: { value: string; onChange: (value: string) => void; required?: boolean }) {
  const [scans, setScans] = useState<OrphanDocument[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { getJson<OrphanDocument[]>("/api/documents/orphan").then(rows => setScans(rows.filter(row => row.kind === "SCAN"))).catch(error => setError(error.message)); }, []);
  async function upload(file?: File) {
    if (!file) return; setBusy(true); setError("");
    try {
      const form = new FormData(); form.append("file", file); form.append("pipeline", "manual");
      const response = await fetch("/api/documents/upload", { method: "POST", body: form }); const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Upload failed.");
      onChange(String(result.scanId));
    } catch (error) { setError(error instanceof Error ? error.message : "Upload failed."); } finally { setBusy(false); }
  }
  return <div className="space-y-2 rounded-lg border p-3"><label className="block">Original document {required ? "(required)" : "(optional)"}<select required={required} disabled={busy} className="block w-full border rounded p-2" value={value} onChange={event => onChange(event.target.value)}><option value="">Choose an unassigned scan...</option>{value && !scans.some(scan => String(scan.scan_id) === value) && <option value={value}>Selected scan #{value}</option>}{scans.map(scan => <option key={scan.id} value={scan.scan_id}>Scan #{scan.scan_id}</option>)}</select></label>
    <label className="block text-sm">Upload image for manual entry<input disabled={busy} type="file" accept="image/png,image/jpeg,image/webp" className="block w-full" onChange={event => { upload(event.target.files?.[0]); event.target.value = ""; }} /></label>
    <p className="text-xs text-gray-500">PNG, JPEG or WebP. OCR is optional. Uploaded scans remain available if you cancel.</p>
    {value && <a className="block text-blue-600 underline" href={"/api/storage?scanId=" + value} target="_blank" rel="noreferrer">View original scan #{value}</a>}
    {!required && value && <button type="button" className="underline" onClick={() => onChange("")}>Remove attachment from draft</button>}
    {busy && <p role="status">Uploading...</p>}{error && <p role="alert" className="text-red-700">{error}</p>}
  </div>;
}
