"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useOfficer } from "@/app/navigation";
import { canEditFinance, canDeleteFinance } from "@/lib/capabilities";
import { DEFAULT_SCHEDULE_SIDES } from "@/lib/schedules";
import { getJson, type ScheduleGroup } from "@/lib/client-types";
type Side = { id?: number; type: "INFLOW" | "OUTFLOW"; label: string };
type Draft = { schedule_number: string; activity_type: ScheduleGroup["activity_type"]; academic_year: string; semester: ScheduleGroup["semester"]; sides: Side[] };
export default function SchedulesPage() {
  const officer = useOfficer();
  const canEdit = canEditFinance(officer), canDelete = canDeleteFinance(officer);
  const [groups, setGroups] = useState<ScheduleGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    getJson<ScheduleGroup[]>("/api/schedules").then(data => { if (active) setGroups(data); }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  function create() {
    setEditing(null); setError("");
    setDraft({ schedule_number: "", activity_type: "IGP", academic_year: officer?.term || "", semester: "FIRST", sides: DEFAULT_SCHEDULE_SIDES.IGP.map(side => ({ ...side })) });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!draft || !canEdit) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(editing ? `/api/schedules/${editing}` : "/api/schedules", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const result = await response.json(); if (!response.ok) throw new Error(result.details?.[0]?.message || result.error);
      setGroups(previous => editing ? previous.map(group => group.id === editing ? result : group) : [...previous, result]); setDraft(null);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save schedules."); }
    finally { setBusy(false); }
  }
  async function remove(group: ScheduleGroup) {
    if (!canDelete || !confirm(`Delete unused group ${group.schedule_number}?`)) return;
    try {
      const response = await fetch(`/api/schedules/${group.id}`, { method: "DELETE" }); const result = await response.json();
      if (!response.ok) throw new Error(result.error); setGroups(previous => previous.filter(row => row.id !== group.id));
    } catch (error) { setError(error instanceof Error ? error.message : "Could not delete group."); }
  }
  async function close(group: ScheduleGroup) {
    if (!canDelete || !confirm(`Close ${group.schedule_number}? It will become read-only.`)) return;
    try {
      const response = await fetch("/api/term", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId: group.id }) }); const result = await response.json();
      if (!response.ok) throw new Error(result.error); setGroups(previous => previous.map(row => row.id === group.id ? { ...row, is_closed: true } : row));
    } catch (error) { setError(error instanceof Error ? error.message : "Could not close group."); }
  }
  if (loading) return <p className="p-8">Loading schedules…</p>;
  return <main className="mx-auto max-w-6xl space-y-6 p-6 sm:p-8"><div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-semibold">Schedule groups</h1><p className="mt-2 text-sm text-gray-500">Manage one or two sides per group. Existing records keep their schedule links during renames.</p></div>{canEdit && <button className="finance-primary" onClick={create}>Create group</button>}</div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</p>}
    {!groups.length && <p className="rounded-xl border bg-white p-8">No schedule groups yet.</p>}
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{groups.map(group => {
      const writable = !group.is_closed && group.academic_year === officer?.term;
      return <article key={group.id} className="space-y-4 rounded-2xl border bg-white p-5"><h2 className="font-semibold">{group.schedule_number}</h2><p className="text-sm text-gray-500">{group.activity_type} · {group.academic_year} · {group.semester.toLowerCase()}</p><div className="space-y-2">{group.schedules.map(side => <p key={side.id} className="rounded-lg bg-gray-50 p-3 text-sm"><span className="mr-2 font-semibold">{side.type}</span>{side.label}{side.summary && <span className="block mt-1 text-xs">{side.summary.records} transactions · {side.summary.incomplete} missing support · {side.summary.mismatched} mismatches · {side.summary.unverified} unverified · {side.summary.unlinked_items} unlinked items</span>}</p>)}</div><div className="flex flex-wrap gap-3 text-sm"><Link className="underline text-blue-600" href={"/archive?group_id=" + group.id + "&term=" + encodeURIComponent(group.academic_year)}>View records & supporting documents</Link>{canEdit && writable && <button className="font-medium text-brand-500" onClick={() => { setEditing(group.id); setDraft({ schedule_number: group.schedule_number, activity_type: group.activity_type, academic_year: group.academic_year, semester: group.semester, sides: group.schedules.map(side => ({ ...side })) }); setError(""); }}>Edit group & sides</button>}{canDelete && writable && <><button className="text-red-700" onClick={() => remove(group)}>Delete group</button><button onClick={() => close(group)}>Close group</button></>}{!writable && <span className="text-gray-500">{group.is_closed ? "Closed" : "Historical"} · Read-only</span>}</div></article>;
    })}</div>
    {draft && <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="schedule-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6"><h2 id="schedule-title" className="text-xl font-semibold">{editing ? "Edit group & sides" : "Create group"}</h2><form onSubmit={save} className="mt-5 space-y-4"><fieldset disabled={busy} className="space-y-4"><label className="block text-sm">Schedule number<input required maxLength={50} className="finance-input mt-2" value={draft.schedule_number} onChange={event => setDraft({ ...draft, schedule_number: event.target.value })} /></label><label className="block text-sm">Activity type<select className="finance-input mt-2" value={draft.activity_type} onChange={event => { const activity_type = event.target.value as Draft["activity_type"]; setDraft({ ...draft, activity_type, ...(!editing ? { sides: DEFAULT_SCHEDULE_SIDES[activity_type].map(side => ({ ...side })) } : {}) }); }}>{["IGP", "MEMBERSHIP", "FINES", "EVENTS"].map(type => <option key={type}>{type}</option>)}</select></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm">Academic year<input readOnly className="finance-input mt-2 bg-gray-50" value={draft.academic_year} /></label><label className="block text-sm">Semester<select className="finance-input mt-2" value={draft.semester} onChange={event => setDraft({ ...draft, semester: event.target.value as Draft["semester"] })}>{["FIRST", "SECOND", "SUMMER"].map(semester => <option key={semester}>{semester}</option>)}</select></label></div><h3 className="font-semibold">Schedule sides</h3><p className="text-xs leading-5 text-gray-500">At least one side is required. Used sides can be renamed, but cannot be removed or change direction. Changing activity type on an existing group preserves its sides.</p>{draft.sides.map((side, index) => <div key={side.id || `new-${index}`} className="space-y-3 rounded-xl border p-3"><label className="block text-sm">Direction<select aria-label={`Side ${index + 1} direction`} className="finance-input mt-2" value={side.type} onChange={event => setDraft({ ...draft, sides: draft.sides.map((row, i) => i === index ? { ...row, type: event.target.value as Side["type"] } : row) })}><option>INFLOW</option><option>OUTFLOW</option></select></label><label className="block text-sm">Side label<input aria-label={`Side ${index + 1} label`} required maxLength={255} className="finance-input mt-2" value={side.label} onChange={event => setDraft({ ...draft, sides: draft.sides.map((row, i) => i === index ? { ...row, label: event.target.value } : row) })} /></label><button type="button" disabled={draft.sides.length === 1} className="text-sm text-red-700 disabled:opacity-40" onClick={() => setDraft({ ...draft, sides: draft.sides.filter((_, i) => i !== index) })}>Remove side</button></div>)}{draft.sides.length < 2 && <button type="button" className="finance-secondary" onClick={() => setDraft({ ...draft, sides: [...draft.sides, { type: draft.sides[0].type === "INFLOW" ? "OUTFLOW" : "INFLOW", label: "" }] })}>Add side</button>}<div className="flex justify-end gap-3"><button type="button" className="finance-secondary" onClick={() => setDraft(null)}>Cancel</button><button disabled={new Set(draft.sides.map(side => side.type)).size !== draft.sides.length} className="finance-primary">{busy ? "Saving…" : "Save group"}</button></div>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</fieldset></form></section></div>}
  </main>;
}
