"use client";
import { useOfficer } from "@/app/navigation";
import { canVerifyFinance } from "@/lib/capabilities";

import { getJson, type Transaction } from "@/lib/client-types";
import React, { useState, useEffect } from "react";
import { CheckCircle, ShieldCheck, Clock } from "lucide-react";





export default function VerificationPage() {
  const officer = useOfficer();
  const canVerify = canVerifyFinance(officer);
  const [pending, setPending] = useState<{ vouchers: Transaction[], receipts: Transaction[] }>({ vouchers: [], receipts: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");


  async function fetchPending() {
    setLoading(true);
    try {
      const data = await getJson<{ vouchers: Transaction[]; receipts: Transaction[] }>("/api/verification");
      setPending(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load verification queue.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleVerification(id: number, type: "DV" | "AR", currentStatus: boolean, version: number) {
    try {
      const res = await fetch("/api/verification/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_id: id,
          type,
          status: !currentStatus,
          version,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Verification failed. Only auditors can perform this action.");
        return;
      }

      fetchPending();
    } catch (e) {
      console.error("Toggle error", e);
    }
  }

  useEffect(() => {
    let active = true;
    getJson<{ vouchers: Transaction[]; receipts: Transaction[] }>("/api/verification")
      .then(data => { if (active) setPending(data); })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : "Could not load verification queue."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) return <div className="p-6 text-center">Loading verification queue...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <ShieldCheck className="text-indigo-600" size={32} />
            Audit Verification
          </h1>
          <p className="text-gray-500">Review and verify financial transactions for correctness.</p>
        </div>
        <div className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2">
          <ShieldCheck size={16} /> {canVerify ? "Auditor actions enabled" : "Viewing access"}
        </div>
      </div>

      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Vouchers Queue */}
        <div className="space-y-4">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Clock className="text-gray-400" size={20} /> Vouchers (DV)
          </h3>
          <div className="space-y-3">
            {pending.vouchers.map((v) => (
              <div key={v.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex justify-between items-center">
                <div>
                  <p className="font-mono font-bold">{v.control_number}</p>
                  <p className="text-xs text-gray-500">{v.released_to?.name} / PHP {parseFloat(v.amount).toLocaleString()}</p>
                </div>
                <button disabled={!canVerify || v.schedule.group?.is_closed || v.schedule.group?.academic_year !== officer?.term}
                  onClick={() => toggleVerification(v.id, "DV", v.is_verified, v.version)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors"
                >
                  <CheckCircle size={14} /> {v.is_verified ? "Unverify" : "Verify"}
                </button>
              </div>
            ))}
            {pending.vouchers.length === 0 && (
              <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-300 text-gray-400 italic">
                No pending vouchers to verify.
              </div>
            )}
          </div>
        </div>

        {/* Receipts Queue */}
        <div className="space-y-4">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Clock className="text-gray-400" size={20} /> Receipts (AR)
          </h3>
          <div className="space-y-3">
            {pending.receipts.map((r) => (
              <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex justify-between items-center">
                <div>
                  <p className="font-mono font-bold">{r.control_number}</p>
                  <p className="text-xs text-gray-500">{r.remitted_by?.name} / PHP {parseFloat(r.amount).toLocaleString()}</p>
                </div>
                <button disabled={!canVerify || r.schedule.group?.is_closed || r.schedule.group?.academic_year !== officer?.term}
                  onClick={() => toggleVerification(r.id, "AR", r.is_verified, r.version)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors"
                >
                  <CheckCircle size={14} /> {r.is_verified ? "Unverify" : "Verify"}
                </button>
              </div>
            ))}
            {pending.receipts.length === 0 && (
              <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-300 text-gray-400 italic">
                No pending receipts to verify.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
