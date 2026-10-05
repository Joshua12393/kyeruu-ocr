"use client";
import { DRAFT_KEY, draftSchema } from "@/lib/ocr-draft";
import { useOfficer } from "@/app/navigation";
import { canEditFinance, canDeleteFinance } from "@/lib/capabilities";

import { getJson, type Transaction, type ScheduleGroup, type ScheduleOption, type UserOption } from "@/lib/client-types";
import TransactionSchedulePicker, { scheduleOptions } from "@/app/transaction-schedule-picker";
import ManualScanPicker from "@/app/manual-scan-picker";
import { responseError } from "@/lib/client-types";
import Link from "next/link";
import React, { useState, useEffect, useCallback } from "react";
import { Plus, FileText, User, Calendar, DollarSign, CreditCard, Hash } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function ReceiptsPage() {
  const officer = useOfficer();
  const canEdit = canEditFinance(officer), canDelete = canDeleteFinance(officer);
  const [receipts, setReceipts] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [schedules, setSchedules] = useState<ScheduleOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<{ version: number; control_number: string; purpose: string; amount: string } | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const [formData, setFormData] = useState({
    control_number: "",
    date: new Date().toISOString().split("T")[0],
    purpose: "",
    amount: "",
    remitted_by_id: "",
    schedule_id: "",
    form_of_payment: "CASH",
    scan_file_id: "",
  });

  const fetchData = useCallback(() => {
    return Promise.all([
        getJson<Transaction[]>("/api/transactions/receipts"),
        getJson<ScheduleGroup[]>("/api/schedules"),
        getJson<UserOption[]>("/api/users"),
      ]).then(([records, groups, userOptions]) => {
      setReceipts(records);
      setSchedules(scheduleOptions(groups, officer?.term));
      setUsers(userOptions);
      setError("");
      const draft = sessionStorage.getItem(DRAFT_KEY);
      if (draft && canEdit) {
        const parsed = draftSchema.parse(JSON.parse(draft));
        if (parsed.kind !== "AR") return;
        setFormData(previous => ({ ...previous, control_number: parsed.fields.control_number || "", date: parsed.fields.date || previous.date, purpose: parsed.fields.purpose || "", amount: parsed.fields.amount || "", schedule_id: String(parsed.scheduleId), scan_file_id: String(parsed.scanId) }));
        setIsModalOpen(true);
        sessionStorage.removeItem(DRAFT_KEY);
      }
    }).catch(e => {
      setError(e instanceof Error ? e.message : "Could not load transactions.");
    }).finally(() => setLoading(false));
  }, [canEdit, officer]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setBusy(true); setError(""); setConflict(null);
    try {
      const res = await fetch(editing ? `/api/transactions/receipts/${editing.id}` : "/api/transactions/receipts", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, version: editing?.version, scan_file_id: formData.scan_file_id || null }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(responseError(err)); if (err.code === "VERSION_CONFLICT") setConflict(err.current);
        return;
      }

      setIsModalOpen(false);
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save transaction.");
    } finally { setBusy(false); }
  }

  function edit(record: Transaction) {
    setConflict(null); setError(""); setEditing(record);
    setFormData({ control_number: record.control_number, date: record.date.slice(0,10), purpose: record.purpose, amount: record.amount, remitted_by_id: String(record.remitted_by?.id || ""), schedule_id: String(record.schedule.id), form_of_payment: record.form_of_payment, scan_file_id: record.scan_file ? String(record.scan_file.id) : "" });
    setIsModalOpen(true);
  }
  async function remove(record: Transaction) {
    if (!confirm(`Delete ${record.control_number} from active totals? Evidence and history stay; linked support returns to the queue and its control number stays reserved.`)) return;
    try {
      const response = await fetch(`/api/transactions/receipts/${record.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: record.version }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Deletion failed.");
      await fetchData();
    } catch (error) { setError(error instanceof Error ? error.message : "Deletion failed."); }
  }

  if (loading) return <div className="p-6 text-center">Loading receipts...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Acknowledgement Receipts</h1>
          <p className="text-gray-500">Record financial inflows (ARs).</p>
        </div>
        <button disabled={!canEdit}
          onClick={() => { setEditing(null); setFormData({ control_number: "", date: new Date().toISOString().slice(0,10), purpose: "", amount: "", remitted_by_id: "", schedule_id: "", form_of_payment: "CASH", scan_file_id: "" }); setIsModalOpen(true); }}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={18} /> New Receipt
        </button>
      </div>

      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-medium">
            <tr>
              <th className="px-4 py-3">Control #</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Remitted By</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Schedule</th>
              <th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {receipts.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-mono font-medium"><Link className="underline text-blue-600" href={"/transactions/AR/" + r.id}>{r.control_number}</Link></td>
                <td className="px-4 py-3">{new Date(r.date).toLocaleDateString()}</td>
                <td className="px-4 py-3">{r.remitted_by?.name}</td>
                <td className="px-4 py-3 font-semibold">PHP {parseFloat(r.amount).toLocaleString()}</td>
                <td className="px-4 py-3">{r.schedule?.label}</td>
                <td className="px-4 py-3">
                  <span className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase",
                    r.is_verified ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                  )}>
                    {r.is_verified ? "Verified" : "Pending"}
                  </span>
                </td>
                <td className="px-4 py-3"><button disabled={!canEdit || r.schedule.group?.is_closed || r.schedule.group?.academic_year !== officer?.term} className="underline mr-3 disabled:opacity-40" onClick={() => edit(r)}>Edit</button><button disabled={!canDelete || r.schedule.group?.is_closed || r.schedule.group?.academic_year !== officer?.term} className="underline text-red-700 disabled:opacity-40" onClick={() => remove(r)}>Delete</button></td>
              </tr>
            ))}
            {receipts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">No receipts recorded yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-bold">{editing ? "Edit Acknowledgement Receipt" : "New Acknowledgement Receipt"}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {error && <p role="alert" className="sm:col-span-2 text-red-700">{error}</p>}
              {conflict && <div className="sm:col-span-2 bg-amber-50 border p-3"><p>Latest: {conflict.control_number}, version {conflict.version}, PHP {conflict.amount}; {conflict.purpose}. Your draft was retained.</p><button type="button" className="underline" onClick={async () => { try { const latest = await getJson<Transaction[]>("/api/transactions/receipts"); const row = latest.find(row => row.id === editing?.id); if (!row) { setError("This transaction was deleted. Close this draft and refresh the list."); return; } if (confirm("Replace this draft with the latest saved values?")) edit(row); } catch (error) { setError(error instanceof Error ? error.message : "Could not reload."); } }}>Review and load latest</button></div>}
              <fieldset disabled={busy || !canEdit} className="contents">
              <div className="space-y-2">
                <label htmlFor="control_number" className="text-sm font-medium text-gray-700 flex items-center gap-2"><Hash size={14}/> Control Number</label>
                <input id="control_number" required maxLength={50} title="Letters and numbers separated by hyphens or slashes, for example AR-2026-001" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  value={formData.control_number} onChange={e => setFormData({...formData, control_number: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label htmlFor="date" className="text-sm font-medium text-gray-700 flex items-center gap-2"><Calendar size={14}/> Date</label>
                <input id="date" required type="date" min={officer?.term_start || undefined} max={officer?.term_end || undefined} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
              </div>
              <div className="col-span-1 sm:col-span-2 space-y-2">
                <label htmlFor="purpose" className="text-sm font-medium text-gray-700 flex items-center gap-2"><FileText size={14}/> Purpose</label>
                <textarea id="purpose" required className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none" rows={2}
                  value={formData.purpose} onChange={e => setFormData({...formData, purpose: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label htmlFor="amount" className="text-sm font-medium text-gray-700 flex items-center gap-2"><DollarSign size={14}/> Amount</label>
                <input id="amount" required type="number" min="0.01" max="9999999999.99" step="0.01" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label htmlFor="form_of_payment" className="text-sm font-medium text-gray-700 flex items-center gap-2"><CreditCard size={14}/> Payment Mode</label>
                <select id="form_of_payment" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  value={formData.form_of_payment} onChange={e => setFormData({...formData, form_of_payment: e.target.value})}>
                  <option value="CASH">Cash</option>
                  <option value="E_WALLET">E-Wallet</option>
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="remitted_by_id" className="text-sm font-medium text-gray-700 flex items-center gap-2"><User size={14}/> Remitted By</label>
                <select id="remitted_by_id" required className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  value={formData.remitted_by_id} onChange={e => setFormData({...formData, remitted_by_id: e.target.value})}>
                  <option value="">Select User...</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <TransactionSchedulePicker type="INFLOW" schedules={schedules} value={formData.schedule_id} onChange={id => setFormData(previous => ({ ...previous, schedule_id: id }))} onOptions={setSchedules} />
              <div className="sm:col-span-2"><ManualScanPicker key={editing?.id || "new"} value={formData.scan_file_id} onChange={value => setFormData(previous => ({ ...previous, scan_file_id: value }))} /></div>
              <div className="col-span-1 sm:col-span-2 flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={busy || !canEdit || !schedules.some(schedule => schedule.type === "INFLOW" && String(schedule.id) === formData.schedule_id)} className="px-4 py-2 text-sm font-medium bg-green-600 text-white hover:bg-green-700 rounded-lg transition-colors">{editing ? "Save changes" : "Create Receipt"}</button>
              </div>
              </fieldset>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
