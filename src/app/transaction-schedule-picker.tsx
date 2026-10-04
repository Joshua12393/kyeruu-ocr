"use client";
import { canEditFinance } from "@/lib/capabilities";

import { useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { getJson, type ScheduleGroup, type ScheduleOption } from "@/lib/client-types";
import { useOfficer } from "./navigation";
import { DEFAULT_SCHEDULE_SIDES } from "@/lib/schedules";
export function scheduleOptions(groups: ScheduleGroup[], currentTerm?: string) {
  return groups.filter(group => !group.is_closed && (!currentTerm || group.academic_year === currentTerm)).flatMap(group => group.schedules.map(schedule => ({ ...schedule, label: `${group.schedule_number} · ${schedule.label} · ${group.academic_year} (${group.semester.toLowerCase()})` })));
}
export default function TransactionSchedulePicker({ type, schedules, value, onChange, onOptions }: {
  type: "INFLOW" | "OUTFLOW"; schedules: ScheduleOption[]; value: string;
  onChange: (id: string) => void; onOptions: (options: ScheduleOption[]) => void;
}) {
  const officer = useOfficer();
  const canCreate = canEditFinance(officer);
  const [creating, setCreating] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [input, setInput] = useState({ schedule_number: "", activity_type: "IGP", academic_year: officer?.term || "", semester: "FIRST" });
  const [includeOutflow, setIncludeOutflow] = useState(false);
  const needsOutflow = type === "OUTFLOW" && ["MEMBERSHIP", "FINES"].includes(input.activity_type);
  const options = schedules.filter(schedule => schedule.type === type);
  const id = `transaction-${type.toLowerCase()}-schedule`;
  async function refresh() {
    setBusy(true); setError("");
    try { onOptions(scheduleOptions(await getJson<ScheduleGroup[]>("/api/schedules"), officer?.term)); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not load schedules."); }
    finally { setBusy(false); }
  }
  async function create() {
    setBusy(true); setError("");
    try {
      const sides = needsOutflow && includeOutflow ? [...DEFAULT_SCHEDULE_SIDES[input.activity_type as "MEMBERSHIP" | "FINES"], { type: "OUTFLOW", label: `${input.activity_type === "MEMBERSHIP" ? "Membership" : "Fine-related"} Expenses` }] : undefined;
      const response = await fetch("/api/schedules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, sides }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.details?.[0]?.message || data.error || "Could not create the schedule group.");
      const newOptions = scheduleOptions([data as ScheduleGroup]);
      const selected = newOptions.find(schedule => schedule.type === type);
      if (!selected) throw new Error("Schedule group was created, but its transaction side is missing. Refresh the list.");
      onOptions([...schedules, ...newOptions]); onChange(String(selected.id)); setCreating(false);
      setInput(previous => ({ ...previous, schedule_number: "" }));
    } catch (error) { setError(error instanceof Error ? error.message : "Could not create the schedule group."); }
    finally { setBusy(false); }
  }
  return <div className="col-span-1 sm:col-span-2 space-y-3 rounded-xl border bg-gray-50/50 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor={id} className="text-sm font-medium text-gray-700">{type === "INFLOW" ? "Inflow" : "Outflow"} Schedule</label><button type="button" disabled={busy} onClick={refresh} className="flex items-center gap-1.5 text-xs font-medium text-brand-500"><RefreshCw size={13} />{busy ? "Loading…" : "Refresh schedules"}</button></div>
    <select id={id} required disabled={busy || !options.length} className="finance-input bg-white" value={value} onChange={event => onChange(event.target.value)}>
      <option value="">{options.length ? "Select a schedule…" : "No open schedules available"}</option>
      {options.map(schedule => <option key={schedule.id} value={schedule.id}>{schedule.label}</option>)}
    </select>
    {!options.length && <p role="status" className="text-sm leading-6 text-amber-700">Choose or create a current-term group with a {type.toLowerCase()} side. Membership and Fines default to inflow only; sides can be customized. Historical and closed groups are read-only.</p>}
    {canCreate && <button type="button" disabled={busy} onClick={() => { setCreating(previous => !previous); setError(""); }} className="flex items-center gap-1.5 text-sm font-semibold text-brand-500"><Plus size={15} />{creating ? "Cancel schedule creation" : "Create schedule group"}</button>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {creating && <div className="space-y-4 rounded-lg border bg-white p-4"><p className="text-sm text-gray-500">Your transaction values stay in this form. The new {type.toLowerCase()} schedule will be selected automatically.</p>
      <div><label htmlFor={`${id}-number`} className="mb-1 block text-sm font-medium">Schedule number</label><input id={`${id}-number`} className="finance-input" maxLength={50} placeholder="e.g. 2026-001" disabled={busy} value={input.schedule_number} onChange={event => setInput(previous => ({ ...previous, schedule_number: event.target.value }))} /></div>
      <div><label htmlFor={`${id}-activity`} className="mb-1 block text-sm font-medium">Activity type</label><select id={`${id}-activity`} className="finance-input" disabled={busy} value={input.activity_type} onChange={event => setInput(previous => ({ ...previous, activity_type: event.target.value }))}><option value="IGP">IGP (Income Generating Project)</option><option value="MEMBERSHIP">Membership</option><option value="FINES">Fines</option><option value="EVENTS">Events</option></select></div>
      <div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor={`${id}-year`} className="mb-1 block text-sm font-medium">Academic year</label><input id={`${id}-year`} className="finance-input" maxLength={20} disabled={busy} value={input.academic_year} onChange={event => setInput(previous => ({ ...previous, academic_year: event.target.value }))} /></div><div><label htmlFor={`${id}-semester`} className="mb-1 block text-sm font-medium">Semester</label><select id={`${id}-semester`} className="finance-input" disabled={busy} value={input.semester} onChange={event => setInput(previous => ({ ...previous, semester: event.target.value }))}><option value="FIRST">First Semester</option><option value="SECOND">Second Semester</option><option value="SUMMER">Summer</option></select></div></div>
      {needsOutflow && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeOutflow} onChange={event => setIncludeOutflow(event.target.checked)} />Add an outflow side for this voucher (this activity defaults to inflow only)</label>}
      <button type="button" disabled={busy || !input.schedule_number.trim() || !input.academic_year.trim() || (needsOutflow && !includeOutflow)} className="finance-primary" onClick={create}>{busy ? "Creating…" : "Create and select schedule"}</button>
    </div>}
  </div>;
}
