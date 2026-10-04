"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
export function PasswordField({ id, label, autoComplete = "new-password", disabled = false }: { id: string; label: string; autoComplete?: string; disabled?: boolean }) {
  const [visible,setVisible] = useState(false);
  return <div><label htmlFor={id} className="mb-2 block text-sm font-medium">{label}</label><div className="relative"><input id={id} name={id} className="finance-input pr-12" type={visible ? "text" : "password"} autoComplete={autoComplete} required minLength={autoComplete === "new-password" ? 12 : undefined} maxLength={256} disabled={disabled} placeholder={autoComplete === "new-password" ? "At least 12 characters" : "Enter your password"} /><button type="button" aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-pressed={visible} className="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-700" onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>;
}
export function AccountFields({ disabled = false }: { disabled?: boolean }) {
  return <><div><label htmlFor="name" className="mb-2 block text-sm font-medium">Full name</label><input id="name" name="name" autoComplete="name" className="finance-input" required maxLength={255} disabled={disabled} placeholder="Your name" /></div><div><label htmlFor="email" className="mb-2 block text-sm font-medium">Email address</label><input id="email" name="email" autoComplete="email" type="email" className="finance-input" required maxLength={255} disabled={disabled} placeholder="you@example.com" /></div><PasswordField id="password" label="Password" disabled={disabled} /><PasswordField id="confirmation" label="Confirm password" disabled={disabled} /></>;
}
export function formError(data: { error?: string; details?: { message: string }[] }) { return data.details?.[0]?.message || data.error || "The request could not be completed."; }
