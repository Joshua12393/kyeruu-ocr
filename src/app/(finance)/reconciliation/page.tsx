"use client";
import { useOfficer } from "@/app/navigation";
import { canEditFinance } from "@/lib/capabilities";

import { getJson, type ReconciliationData, type OrphanDocument, type Transaction } from "@/lib/client-types";
import React, { useState, useEffect } from "react";
import { AlertTriangle, FileWarning, Search, Link as LinkIcon } from "lucide-react";





export default function ReconciliationPage() {
  const canEdit = canEditFinance(useOfficer());
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [orphans, setOrphans] = useState<OrphanDocument[]>([]);
  const [error, setError] = useState("");
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [selectedOrphan, setSelectedOrphan] = useState<OrphanDocument | null>(null);

  useEffect(() => {
    fetchData();
    fetchOrphans();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const result = await getJson<ReconciliationData>("/api/reconciliation");
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load reconciliation.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchOrphans() {
    try {
      const result = await getJson<OrphanDocument[]>("/api/documents/orphan");
      setOrphans(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load scans.");
    }
  }

  async function handleLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const payload = {
      scan_id: selectedOrphan?.id,
      transaction_type: formData.get("type"),
      transaction_id: formData.get("transaction_id"),
    };

    try {
      const records = await getJson<Transaction[]>(payload.transaction_type === "DV" ? "/api/transactions/vouchers" : "/api/transactions/receipts");
      const target = records.find(record => record.control_number === String(payload.transaction_id).trim());
      if (!target) throw new Error("Control number not found.");
      const res = await fetch(selectedOrphan?.kind === "SCAN" ? "/api/documents/orphan/link" : "/api/documents/supporting/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectedOrphan?.kind === "SCAN" ? { ...payload, scan_id: selectedOrphan.scan_id, transaction_id: target.id, version: target.version } : { kind: selectedOrphan?.kind, document_id: selectedOrphan?.id, transaction_id: target.id, version: target.version, amount_covered: formData.get("amount_covered") }),
      });

      if (!res.ok) throw new Error((await res.json()).error || "Linking failed");

      setIsLinkModalOpen(false);
      fetchOrphans();
      fetchData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to link document");
    }
  }

  if (loading) return <div className="p-6 text-center">Loading reconciliation data...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Reconciliation Center</h1>
          <p className="text-gray-500">Audit flags and orphaned document management.</p>
        </div>
      </div>

      {error && <p role="alert" className="text-red-700">{error}</p>}
      {/* Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-6 flex items-center gap-4">
          <div className="bg-yellow-100 p-3 rounded-full text-yellow-600">
            <FileWarning size={24} />
          </div>
          <div>
            <p className="text-yellow-800 font-medium">Incomplete Transactions</p>
            <p className="text-3xl font-bold text-yellow-900">{data?.summary.total_incomplete || 0}</p>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 flex items-center gap-4">
          <div className="bg-red-100 p-3 rounded-full text-red-600">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-red-800 font-medium">Amount Mismatches</p>
            <p className="text-3xl font-bold text-red-900">{data?.summary.total_mismatches || 0}</p>
          </div>
        </div>
      </div>

      {/* Orphan Queue */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 font-bold text-xl">
          <Search size={20} /> Orphan Document Queue
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {orphans.map((orphan) => (
            <div key={`${orphan.kind}-${orphan.id}`} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex justify-between items-center">
              <div className="truncate mr-4">
                <p className="text-sm font-medium truncate">{orphan.file_path}</p>
                <p className="text-xs text-gray-400">{new Date(orphan.uploaded_at).toLocaleDateString()}</p>
              </div>
              <button disabled={!canEdit}
                onClick={() => { setSelectedOrphan(orphan); setIsLinkModalOpen(true); }}
                className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                title="Link to Transaction"
              >
                <LinkIcon size={16} />
              </button>
            </div>
          ))}
          {orphans.length === 0 && <p className="text-gray-400 italic">No orphaned documents in queue.</p>}
        </div>
      </div>

      {/* Detail Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <FileWarning className="text-yellow-500" size={18} /> Missing Documents
          </h3>
          <div className="space-y-2">
            {data?.incomplete.vouchers.map((v) => (
              <div key={v.id} className="p-3 bg-white border border-gray-200 rounded-lg flex justify-between items-center">
                <span className="text-sm">DV: {v.control_number}</span>
                <span className="text-xs font-bold text-yellow-600 bg-yellow-50 px-2 py-1 rounded">MISSING SUPPORT</span>
              </div>
            ))}
            {data?.incomplete.receipts.map((r) => (
              <div key={r.id} className="p-3 bg-white border border-gray-200 rounded-lg flex justify-between items-center">
                <span className="text-sm">AR: {r.control_number}</span>
                <span className="text-xs font-bold text-yellow-600 bg-yellow-50 px-2 py-1 rounded">MISSING SUPPORT</span>
              </div>
            ))}
            {data?.summary.total_incomplete === 0 && <p className="text-gray-400 text-sm italic">All transactions have supporting documents.</p>}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <AlertTriangle className="text-red-500" size={18} /> Amount Mismatches
          </h3>
          <div className="space-y-2">
            {data?.mismatches.vouchers.map((v) => (
              <div key={v.id} className="p-3 bg-white border border-gray-200 rounded-lg flex justify-between items-center">
                <span className="text-sm">DV: {v.control_number}</span>
                <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded">MISMATCH</span>
              </div>
            ))}
            {data?.mismatches.receipts.map((r) => (
              <div key={r.id} className="p-3 bg-white border border-gray-200 rounded-lg flex justify-between items-center">
                <span className="text-sm">AR: {r.control_number}</span>
                <span className="text-xs font-bold text-red-600 bg-red-50 rounded px-2 py-1">MISMATCH</span>
              </div>
            ))}
            {data?.summary.total_mismatches === 0 && <p className="text-gray-400 text-sm italic">No amount mismatches found.</p>}
          </div>
        </div>
      </div>

      {/* Link Modal */}
      {isLinkModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold">Link Orphan Document</h2>
              <p className="text-sm text-gray-500">Assign this scan to a specific transaction.</p>
            </div>
            <form onSubmit={handleLink} className="p-6 space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg text-xs font-mono truncate">
                {selectedOrphan?.file_path}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Transaction Type</label>
                <select name="type" className="w-full px-3 py-2 border rounded-lg outline-none" required>
                  {selectedOrphan?.kind !== "SHEET" && <option value="DV">Disbursement Voucher (DV)</option>}
                  {selectedOrphan?.kind !== "PARTICULAR" && <option value="AR">Acknowledgement Receipt (AR)</option>}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Transaction Control #</label>
                <input name="transaction_id" placeholder="Enter control number" className="w-full px-3 py-2 border rounded-lg outline-none" required />
              </div>
              {selectedOrphan?.kind === "SHEET" && <label className="block">Amount covered<input required name="amount_covered" type="number" min="0.01" step="0.01" className="block border rounded p-2" /></label>}
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setIsLinkModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                <button disabled={!canEdit} type="submit" className="px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors">Link Now</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
