"use client";

import { getJson, type Transaction, type ArchiveTransaction } from "@/lib/client-types";
import Image from "next/image";
import React, { useState } from "react";
import { Search, FileText, Image as ImageIcon, Download, ExternalLink } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function ArchivePage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ArchiveTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<ArchiveTransaction | null>(null);
  const [error, setError] = useState("");

  function downloadJson(value: unknown, filename: string) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function exportRecords() {
    try { downloadJson(await getJson<unknown>("/api/term"), "finance-export.json"); }
    catch (error) { setError(error instanceof Error ? error.message : "Export failed."); }
  }

  async function handleSearch() {
    setLoading(true);
    try {
      // In a real app, this would call a dedicated search API.
      // For now, we simulate a search across Vouchers and Receipts.
      const [vRes, rRes] = await Promise.all([
        getJson<Transaction[]>("/api/transactions/vouchers"),
        getJson<Transaction[]>("/api/transactions/receipts"),
      ]);

      const vData = vRes;
      const rData = rRes;

      const filteredV = vData.filter((v) =>
        v.control_number.toLowerCase().includes(query.toLowerCase()) ||
        v.purpose.toLowerCase().includes(query.toLowerCase())
      );
      const filteredR = rData.filter((r) =>
        r.control_number.toLowerCase().includes(query.toLowerCase()) ||
        r.purpose.toLowerCase().includes(query.toLowerCase())
      );

      setResults([...filteredV.map((v) => ({ ...v, type: 'DV' as const })), ...filteredR.map((r) => ({ ...r, type: 'AR' as const }))]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Financial Archive</h1>
          <p className="text-gray-500">Search across all terms and download official records.</p>
        </div>
      </div>

      {/* Search Bar */}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Search by control number, purpose..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 disabled:bg-gray-300 transition-all flex items-center gap-2"
        >
          {loading ? "Searching..." : "Search Archive"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Results List */}
        <div className="lg:col-span-1 space-y-4">
          <h3 className="font-bold text-lg">Search Results</h3>
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
            {results.map((res) => (
              <div
                key={`${res.type}-${res.id}`}
                onClick={() => setSelectedDoc(res)}
                className={cn(
                  "p-4 bg-white border rounded-xl cursor-pointer transition-all hover:border-blue-400",
                  selectedDoc?.id === res.id && selectedDoc?.type === res.type ? "border-blue-600 ring-1 ring-blue-600" : "border-gray-200"
                )}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase",
                    res.type === 'DV' ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                  )}>
                    {res.type}
                  </span>
                  <span className="text-xs text-gray-400">{new Date(res.date).toLocaleDateString()}</span>
                </div>
                <p className="font-mono font-bold text-sm">{res.control_number}</p>
                <p className="text-xs text-gray-500 truncate">{res.purpose}</p>
              </div>
            ))}
            {results.length === 0 && !loading && <p className="text-gray-400 italic text-sm">No records found.</p>}
          </div>
        </div>

        {/* Side-by-Side View (FIN-11) */}
        <div className="lg:col-span-2">
          {selectedDoc ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex justify-between items-center border-b pb-4">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <FileText className="text-blue-600" size={24} />
                  Document Detail: {selectedDoc.control_number}
                </h3>
                <div className="flex gap-2">
                  <button onClick={() => downloadJson(selectedDoc, `${selectedDoc.type}-${selectedDoc.control_number}.json`)} className="p-2 text-gray-400 hover:text-blue-600 transition-colors" title="Download transaction JSON">
                    <Download size={20} />
                  </button>
                  <button onClick={exportRecords} className="p-2 text-gray-400 hover:text-blue-600 transition-colors" title="Export financial records as JSON">
                    <ExternalLink size={20} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Data Side */}
                <div className="space-y-4 bg-gray-50 p-4 rounded-xl">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Transaction Data</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between border-b border-gray-200 pb-2">
                      <span className="text-sm text-gray-500">Amount</span>
                      <span className="text-sm font-bold">PHP {parseFloat(selectedDoc.amount).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200 pb-2">
                      <span className="text-sm text-gray-500">Date</span>
                      <span className="text-sm font-medium">{new Date(selectedDoc.date).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200 pb-2">
                      <span className="text-sm text-gray-500">Person</span>
                      <span className="text-sm font-medium">{selectedDoc.released_to?.name || selectedDoc.remitted_by?.name}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-sm text-gray-500">Purpose</span>
                      <p className="text-sm font-medium">{selectedDoc.purpose}</p>
                    </div>
                  </div>
                </div>

                {/* Scan Side (FIN-11) */}
                <div className="flex flex-col items-center justify-center bg-gray-100 rounded-xl border-2 border-dashed border-gray-300 overflow-hidden min-h-[400px]">
                  {selectedDoc.scan_file ? (
                    <Image unoptimized width={800} height={1000}
                      src={`/api/storage?scanId=${selectedDoc.scan_file.id}`}
                      alt="Document Scan"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-center p-6">
                      <ImageIcon className="mx-auto text-gray-300 mb-2" size={48} />
                      <p className="text-sm text-gray-400">No digital scan available</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
              <FileText size={64} className="mb-4 opacity-20" />
              <p className="text-lg">Select a transaction from the list to view its digital scan and data side-by-side.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
