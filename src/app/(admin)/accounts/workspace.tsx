"use client";
import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, Plus, Search, ShieldCheck, Trash2, UserCheck, UserX, UsersRound, X } from "lucide-react";
import { AccountFields, formError } from "@/app/auth-fields";
import { useOfficer } from "@/app/navigation";
const roles = [{ value: "TREASURER", label: "Treasurer" }, { value: "ASSISTANT_TREASURER", label: "Assistant Treasurer" }, { value: "AUDITOR", label: "Auditor" }, { value: "PRESIDENT", label: "President" }, { value: "ADVISER", label: "Adviser" }, { value: "ADMIN", label: "Admin" }, { value: "PENDING", label: "No finance access" }];
type Account = { id: number; name: string; email: string; role: string; is_active: boolean };
async function fetchAccounts(): Promise<{ users: Account[]; term: string }> {
  const response = await fetch("/api/accounts"), data = await response.json();
  if (!response.ok) throw new Error(formError(data));
  return data;
}
export default function AccountsWorkspace() {
  const admin = useOfficer();
  const [users, setUsers] = useState<Account[]>([]), [term, setTerm] = useState("");
  const [loading, setLoading] = useState(true), [creating, setCreating] = useState(false), [busy, setBusy] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null), [choices, setChoices] = useState<Record<number, string>>({});
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<Account | null>(null);
  const load = useCallback(async () => { const data = await fetchAccounts(); setUsers(data.users); setTerm(data.term); }, []);
  useEffect(() => {
    let active = true;
    void fetchAccounts().then(data => { if (active) { setUsers(data.users); setTerm(data.term); } })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : "Could not load accounts."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, values = Object.fromEntries(new FormData(form)); setError(""); setNotice("");
    if (values.password !== values.confirmation) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const data = await response.json(); if (!response.ok) throw new Error(formError(data));
      form.reset(); setCreating(false); setNotice(data.message); await load();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not create the account."); }
    finally { setBusy(false); }
  }
  async function change(user: Account, method: "PATCH" | "DELETE", body: unknown) {
    setSavingId(user.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/accounts", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw new Error(formError(data));
      setNotice(data.message); setDeleting(null); setChoices(previous => { const next = { ...previous }; delete next[user.id]; return next; }); await load();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not update the account."); setDeleting(null); }
    finally { setSavingId(null); }
  }
  const shown = users.filter(user => `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase()));
  const locked = busy || savingId !== null;
  return <main className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="mb-1 text-sm font-medium text-brand-500">Administration</p><h1 className="text-2xl font-semibold">Account management</h1><p className="mt-2 text-sm text-gray-500">Create accounts, assign roles, and control access.</p></div><button onClick={() => setCreating(value => !value)} disabled={locked} className="finance-primary">{creating ? <X size={18} /> : <Plus size={18} />}{creating ? "Close form" : "Create account"}</button></div>
    <div className="grid gap-4 sm:grid-cols-3">{[{ label: "Registered accounts", value: users.length }, { label: "Active accounts", value: users.filter(user => user.is_active).length }, { label: "Awaiting a role", value: users.filter(user => user.role === "PENDING" && user.is_active).length }].map(item => <section key={item.label} className="finance-card p-5"><p className="text-sm text-gray-500">{item.label}</p><p className="mt-2 text-2xl font-semibold">{item.value}</p></section>)}</div>
    <div className="flex gap-3 rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm leading-6 text-gray-600"><ShieldCheck size={20} className="shrink-0 text-brand-500" /><p>Only Admins manage accounts. Officer roles apply to term {term || admin?.term}. Deactivation revokes existing sessions; reactivation requires signing in again.</p></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}{notice && <p role="status" className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</p>}
    {creating && <section className="finance-card max-w-2xl p-6"><h2 className="text-lg font-semibold">Create an account</h2><p className="mt-2 text-sm text-gray-500">Choose the account&apos;s role and sign-in details.</p><form onSubmit={create} className="mt-6 space-y-4"><AccountFields disabled={busy} /><div><label htmlFor="role" className="mb-2 block text-sm font-medium">Account role</label><select id="role" name="role" className="finance-input" disabled={busy}>{roles.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}</select></div><button className="finance-primary" disabled={busy}>{busy ? <LoaderCircle size={18} className="animate-spin" /> : <Plus size={18} />}{busy ? "Creating…" : "Create account"}</button></form></section>}
    <section className="finance-card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-5"><div className="flex items-center gap-3"><UsersRound size={21} className="text-gray-500" /><div><h2 className="font-semibold">Registered accounts</h2><p className="mt-1 text-xs text-gray-500">Deleted accounts are hidden; financial history is retained.</p></div></div><div className="relative"><Search size={16} className="absolute left-3 top-3 text-gray-400" /><input aria-label="Search accounts" className="finance-input pl-9" placeholder="Search name or email" value={search} onChange={event => setSearch(event.target.value)} /></div></div>
      {loading ? <p role="status" className="p-6 text-sm text-gray-500">Loading accounts…</p> : shown.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="px-6 py-3 font-medium">Account</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Role</th><th className="px-4 py-3 font-medium">Actions</th></tr></thead><tbody>{shown.map(user => <tr key={user.id} className="border-t"><td className="px-6 py-4"><p className="font-medium">{user.name}{user.id === admin?.id && <span className="ml-2 text-xs text-gray-400">You</span>}</p><p className="mt-1 text-xs text-gray-500">{user.email}</p></td><td className="px-4 py-4"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${user.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>{user.is_active ? "Active" : "Deactivated"}</span>{user.role === "PENDING" && <p className="mt-2 whitespace-nowrap text-xs text-amber-600">Awaiting approval</p>}</td><td className="px-4 py-4"><div className="flex items-center gap-2"><label className="sr-only" htmlFor={`role-${user.id}`}>Role for {user.name}</label><select id={`role-${user.id}`} disabled={user.id === admin?.id || locked} className="finance-input min-w-48" value={choices[user.id] || user.role} onChange={event => setChoices(previous => ({ ...previous, [user.id]: event.target.value }))}>{roles.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}</select><button disabled={user.id === admin?.id || locked || (choices[user.id] || user.role) === user.role} onClick={() => change(user, "PATCH", { action: "role", user_id: user.id, role: choices[user.id] || user.role })} className="finance-secondary whitespace-nowrap">Save role</button></div></td><td className="px-4 py-4"><div className="flex gap-2"><button disabled={user.id === admin?.id || locked} onClick={() => change(user, "PATCH", { action: "status", user_id: user.id, is_active: !user.is_active })} className="finance-secondary whitespace-nowrap">{user.is_active ? <UserX size={16} /> : <UserCheck size={16} />}{user.is_active ? "Deactivate" : "Reactivate"}</button><button aria-label={`Delete account for ${user.name}`} disabled={user.id === admin?.id || locked} onClick={() => setDeleting(user)} className="rounded-lg border border-red-100 p-2.5 text-red-600 hover:bg-red-50 disabled:opacity-40"><Trash2 size={17} /></button></div></td></tr>)}</tbody></table></div> : <p className="p-6 text-sm text-gray-500">{search ? "No accounts match your search." : "No registered accounts yet."}</p>}
    </section>
    <p className="text-xs text-gray-400">Another Admin must change your own account. Admin access is separate from finance entry and verification roles.</p>
    {deleting && <div className="fixed inset-0 z-50 grid place-items-center bg-gray-900/40 p-5"><section role="dialog" aria-modal="true" aria-labelledby="delete-title" className="finance-card w-full max-w-md p-6"><h2 id="delete-title" className="text-lg font-semibold">Delete {deleting.name}&apos;s account?</h2><p className="mt-3 text-sm leading-6 text-gray-500">This removes their login and hides the account from this list. Financial records and audit history remain. Use Deactivate if you may want to restore access later.</p><div className="mt-6 flex justify-end gap-3"><button className="finance-secondary" disabled={locked} autoFocus onClick={() => setDeleting(null)}>Cancel</button><button className="finance-primary bg-red-600 hover:bg-red-700" disabled={locked} onClick={() => change(deleting, "DELETE", { user_id: deleting.id })}>{locked ? "Deleting…" : "Delete account"}</button></div></section></div>}
  </main>;
}
