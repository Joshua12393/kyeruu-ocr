"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { AccountFields, formError } from "../auth-fields";
export default function RegisterForm() {
  const router = useRouter(); const [busy,setBusy] = useState(false); const [error,setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); setError("");
    if (values.password !== values.confirmation) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const data = await response.json(); if (!response.ok) throw new Error(formError(data));
      router.push("/login?created=1");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not create your account."); setBusy(false); }
  }
  return <><p className="mb-2 text-sm font-medium text-brand-500">Get started</p><h1 className="text-3xl font-semibold tracking-tight">Create your account</h1><p className="mt-3 text-sm leading-6 text-gray-500">Set up your sign-in details. Your officer role will be approved for the active term.</p>{error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<form className="mt-7 space-y-4" onSubmit={submit}><AccountFields disabled={busy} /><div className="flex gap-3 rounded-lg bg-brand-50 p-3 text-xs leading-5 text-gray-600"><ShieldCheck size={18} className="shrink-0 text-brand-500" /><p>An Admin assigns finance access. Creating an account does not give access to financial records.</p></div><button disabled={busy} className="finance-primary w-full py-3">{busy ? <LoaderCircle size={18} className="animate-spin" /> : <ArrowRight size={18} />}{busy ? "Creating account…" : "Create account"}</button></form><p className="mt-6 text-center text-sm text-gray-500">Already have an account? <Link className="font-semibold text-brand-500 hover:underline" href="/login">Sign in</Link></p></>;
}
