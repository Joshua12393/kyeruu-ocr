"use client";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { safeCallback } from "@/lib/auth-redirect";
import { PasswordField } from "../auth-fields";
export default function LoginForm() {
  const params = useSearchParams();
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const initialError = params.get("error") ? "Sign-in could not be completed. Check your credentials or try again shortly." : "";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget); setBusy(true); setError("");
    try {
      const callbackUrl = safeCallback(params.get("callbackUrl"));
      const response = await signIn("credentials", { email: String(values.get("email")).trim().toLowerCase(), password: String(values.get("password")), redirect: false, callbackUrl });
      if (!response?.ok || response.error) { setError(response?.error === "CredentialsSignin" ? "The email or password is incorrect. Please try again." : "Sign-in is temporarily unavailable. Check that the database is running and try again."); setBusy(false); return; }
      window.location.assign(callbackUrl);
    } catch { setError("Could not connect. Check your connection and try again."); setBusy(false); }
  }
  return <><p className="mb-2 text-sm font-medium text-brand-500">Welcome back</p><h1 className="text-3xl font-semibold tracking-tight">Sign in to your workspace</h1><p className="mt-3 text-sm leading-6 text-gray-500">Use your account to access financial records and document reviews.</p>{params.get("created") === "1" && <p role="status" className="mt-6 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">Your account is ready. Sign in below; an Admin will approve your officer access.</p>}{(error || initialError) && <p role="alert" className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error || initialError}</p>}<form className="mt-8 space-y-5" onSubmit={submit}><div><label htmlFor="email" className="mb-2 block text-sm font-medium">Email address</label><input id="email" name="email" type="email" autoComplete="username" required maxLength={255} disabled={busy} placeholder="you@example.com" className="finance-input" /></div><PasswordField id="password" label="Password" autoComplete="current-password" disabled={busy} /><button disabled={busy} className="finance-primary w-full py-3">{busy ? <LoaderCircle size={18} className="animate-spin" /> : <ArrowRight size={18} />}{busy ? "Signing in…" : "Sign in"}</button></form><p className="mt-7 text-center text-sm text-gray-500">New to the workspace? <Link className="font-semibold text-brand-500 hover:underline" href="/register">Create an account</Link></p></>;
}
