"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
type Term = { name: string; starts_on: string; ends_on: string };
export default function TermWorkspace({ current, version, terms }: { current: string; version: number; terms: Term[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Term>(terms.find(term => term.name === current) || { name: current, starts_on: "", ends_on: "" });
  const [makeCurrent, setMakeCurrent] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/oms/terms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, starts_on: draft.starts_on || null, ends_on: draft.ends_on || null, make_current: makeCurrent, version }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.details?.[0]?.message || result.error);
      setMessage(result.message); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save term."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-5xl space-y-6 p-6 sm:p-8"><div><h1 className="text-3xl font-semibold">OMS terms & calendar</h1><p className="mt-2 text-gray-500">Current assignment term: <strong>{current}</strong>. Calendar dates are inclusive and use Philippine time.</p></div>
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6">Unset dates, a future start, or a past end make Finance read-only. Current officers can read historical records. Switching terms requires new officer assignments; it does not close or delete records.</p>
    {message && <p role="status" className="rounded-xl border p-4">{message}</p>}
    <form onSubmit={save} className="space-y-5 rounded-2xl border bg-white p-6"><h2 className="font-semibold">Configure a term</h2><label className="block text-sm">Term name<input required maxLength={50} className="finance-input mt-2" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm">Start date<input type="date" className="finance-input mt-2" value={draft.starts_on} onChange={event => setDraft({ ...draft, starts_on: event.target.value })} /></label><label className="block text-sm">End date<input type="date" className="finance-input mt-2" value={draft.ends_on} onChange={event => setDraft({ ...draft, ends_on: event.target.value })} /></label></div><label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={makeCurrent} onChange={event => setMakeCurrent(event.target.checked)} />Use as the current officer term</label><button disabled={busy} className="finance-primary">{busy ? "Saving…" : "Save term"}</button></form>
    <section className="space-y-3"><h2 className="font-semibold">Saved terms</h2>{terms.map(term => <button key={term.name} className="flex w-full flex-wrap justify-between gap-2 rounded-xl border bg-white p-4 text-left" onClick={() => { setDraft(term); setMakeCurrent(term.name === current); setMessage(""); }}><span className="font-medium">{term.name}{term.name === current ? " · Current" : ""}</span><span className="text-sm text-gray-500">{term.starts_on && term.ends_on ? `${term.starts_on} to ${term.ends_on}` : "Dates unset"}</span></button>)}</section>
  </main>;
}
