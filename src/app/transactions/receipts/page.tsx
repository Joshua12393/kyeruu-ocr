"use client";

import { getJson, type Transaction, type ScheduleGroup, type ScheduleOption, type UserOption } from "@/lib/client-types";
import React, { useState, useEffect } from "react";
import { Plus, FileText, User, Calendar, DollarSign, CreditCard, Hash, Tag } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [schedules, setSchedules] = useState<ScheduleOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [error, setError] = useState("");
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

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [records, groups, userOptions] = await Promise.all([
        getJson<Transaction[]>("/api/transactions/receipts"),
        getJson<ScheduleGroup[]>("/api/schedules"),
        getJson<UserOption[]>("/api/users"),
      ]);
      setReceipts(records);
      setSchedules(groups.filter(group => !group.is_closed).flatMap(group => group.schedules));
      setUsers(userOptions);
      setError("");
      const draft = sessionStorage.getItem("ocr-transaction-draft");
      if (draft) {
        const parsed = JSON.parse(draft) as { scanId: number; fields: Record<string, string> };
        setFormData(previous => ({ ...previous, control_number: parsed.fields.control_number || "", date: parsed.fields.date || previous.date, purpose: parsed.fields.purpose || "", amount: parsed.fields.amount || "", scan_file_id: String(parsed.scanId) }));
        setIsModalOpen(true);
        sessionStorage.removeItem("ocr-transaction-draft");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load transactions.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch(editing ? `/api/transactions/receipts/${editing.id}` : "/api/transactions/receipts", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, version: editing?.version, scan_file_id: formData.scan_file_id || null }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to create receipt");
        return;
      }

      setIsModalOpen(false);
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save transaction.");
    }
  }

  function edit(record: Transaction) {
    setEditing(record);
    setFormData({ control_number: record.control_number, date: record.date.slice(0,10), purpose: record.purpose, amount: record.amount, remitted_by_id: String(record.remitted_by?.id || ""), schedule_id: String(record.schedule.id), form_of_payment: record.form_of_payment, scan_file_id: record.scan_file ? String(record.scan_file.id) : "" });
    setIsModalOpen(true);
  }
  async function remove(record: Transaction) {
    if (!confirm(`Delete ${record.control_number}?`)) return;
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
        <button
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
                <td className="px-4 py-3 font-mono font-medium">{r.control_number}</td>
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
                <td className="px-4 py-3"><button className="underline mr-3" onClick={() => edit(r)}>Edit</button><button className="underline text-red-700" onClick={() => remove(r)}>Delete</button></td>
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-bold">New Acknowledgement Receipt</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2"><Hash size={14}/> Control Number</label>
                <input required className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  value={formData.control_number} onChange={e => setFormData({...formData, control_number: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2"><Calendar size={14}/> Date</label>
                <input required type="date" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
              </div>
              <div className="col-span-2 space-y-2">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2"><FileText size={14}/> Purpose</label>
                <textarea required className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none" rows={2}
                  value={formData.purpose} onChange={e => setFormData({...formData, purpose: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2"><DollarSign size={14}/> Amount</label>
                <input required type="number" step="0.01" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2"><CreditCard size={14}/> Payment Mode</label>
                <select className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  value={formData.form_of_payment} onChange={e => setFormData({...formData, form_of_payment: e.target.value})}>
                  <option value="CASH">Cash</option>
                  <option value="E_WALLET">E-Wallet</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2"><User size={14}/> Remitted By</label>
                <select required className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  value={formData.remitted_by_id} onChange={e => setFormData({...formData, remitted_by_id: e.target.value})}>
                  <option value="">Select User...</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2"><Tag size={14}/> Inflow Schedule</label>
                <select required className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  value={formData.schedule_id} onChange={e => setFormData({...formData, schedule_id: e.target.value})}>
                  <option value="">Select Schedule...</option>
                  {schedules.filter((s) => s.type === 'INFLOW').map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div className="col-span-2 flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium bg-green-600 text-white hover:bg-green-700 rounded-lg transition-colors">{editing ? "Save changes" : "Create Receipt"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
