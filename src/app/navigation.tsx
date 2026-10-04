"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ArrowLeftRight, BookOpen, ChevronRight, FileCheck2, FileText, FolderArchive, LayoutDashboard, LogOut, Menu, ScanLine, ShieldCheck, UsersRound, Wallet, X } from "lucide-react";
import type { AuthenticatedUser } from "@/lib/auth";

const OfficerContext = createContext<AuthenticatedUser | null>(null);
export const useOfficer = () => useContext(OfficerContext);
const groups = [
  { label: "WORKSPACE", links: [{ name: "Overview", url: "/", icon: LayoutDashboard }, { name: "Schedules", url: "/schedules", icon: BookOpen }] },
  { label: "FINANCE", links: [{ name: "Disbursement vouchers", url: "/transactions/vouchers", icon: Wallet }, { name: "Acknowledgement receipts", url: "/transactions/receipts", icon: FileText }] },
  { label: "DOCUMENTS & REVIEW", links: [{ name: "Document OCR", url: "/ocr", icon: ScanLine }, { name: "Supporting documents", url: "/supporting", icon: FileCheck2 }, { name: "Reconciliation", url: "/reconciliation", icon: ArrowLeftRight }, { name: "Audit verification", url: "/verification", icon: ShieldCheck }, { name: "Financial archive", url: "/archive", icon: FolderArchive }] },
  { label: "ADMINISTRATION", links: [{ name: "Account management", url: "/accounts", icon: UsersRound }, { name: "Terms & calendar", url: "/terms", icon: BookOpen }] },
];
export default function Navigation({ officer, children }: { officer: AuthenticatedUser | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const title = groups.flatMap(group => group.links).find(link => link.url === pathname)?.name || "Finance workspace";
  const role = officer?.position.replaceAll("_", " ").toLowerCase() || "Officer";
  const visibleGroups = groups.filter(group => officer?.position === "ADMIN" ? group.label === "ADMINISTRATION" : group.label !== "ADMINISTRATION");
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); menuButton.current?.focus(); }
      if (event.key === "Tab") {
        const links = document.querySelectorAll<HTMLElement>("#finance-navigation a, #finance-navigation button");
        const first = links[0], last = links[links.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return <OfficerContext.Provider value={officer}>
    <a href="#workspace" className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-white focus:p-4">Skip to content</a>
    {open && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-gray-900/35 lg:hidden" onClick={() => { setOpen(false); menuButton.current?.focus(); }} />}
    <aside id="finance-navigation" aria-label="Finance navigation" className={`fixed inset-y-0 left-0 z-40 flex w-[270px] flex-col border-r border-gray-200 bg-white transition-transform lg:visible lg:translate-x-0 ${open ? "visible translate-x-0" : "invisible -translate-x-full"}`}>
      <div className="flex h-22 items-center gap-3 px-6"><Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500 text-white"><ScanLine size={23} /></span><span className="text-xl font-bold tracking-tight">Kyeruu<span className="text-brand-500"> OCR</span></span></Link><button ref={closeButton} aria-label="Close menu" className="ml-auto rounded-lg p-2 lg:hidden" onClick={() => { setOpen(false); menuButton.current?.focus(); }}><X size={20} /></button></div>
      <nav className="flex-1 overflow-y-auto px-4 py-3">{visibleGroups.map(group => <div key={group.label} className="mb-7"><p className="mb-3 px-3 text-[11px] font-semibold tracking-[.12em] text-gray-400">{group.label}</p><div className="space-y-1">{group.links.map(({ name, url, icon: Icon }) => <Link key={url} href={url} onClick={() => setOpen(false)} aria-current={pathname === url ? "page" : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors ${pathname === url ? "bg-brand-50 text-brand-500" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}><Icon size={19} className="shrink-0" /><span>{name}</span>{pathname === url && <ChevronRight size={16} className="ml-auto shrink-0" />}</Link>)}</div></div>)}</nav>
      <div className="m-4 rounded-xl bg-gray-50 p-4"><p className="text-xs font-medium text-gray-500">ACTIVE OFFICER TERM</p><p className="mt-1 font-semibold">{officer?.term || "Assignment needed"}</p><p className="mt-2 text-xs leading-5 text-gray-500">Every document. Every transaction.<br />One accountable workspace.</p></div>
    </aside>
    <div className="min-h-screen lg:pl-[270px]">
      <header className="sticky top-0 z-20 flex h-20 items-center justify-between gap-4 border-b border-gray-200 bg-white/95 px-5 backdrop-blur sm:px-8">
        <div className="flex items-center gap-4"><button ref={menuButton} aria-label="Open navigation" aria-expanded={open} aria-controls="finance-navigation" onClick={() => setOpen(true)} className="rounded-lg border border-gray-200 p-2.5 lg:hidden"><Menu size={20} /></button><div><p className="text-xs text-gray-400">{officer?.position === "ADMIN" ? "Admin workspace" : "Finance workspace"}</p><p className="font-semibold">{title}</p></div></div>
        <div className="flex items-center gap-3 sm:gap-5"><span className="hidden rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-500 sm:block">Term {officer?.term}</span><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 font-semibold text-brand-500">{officer?.name.charAt(0).toUpperCase() || "O"}</span><div className="hidden sm:block"><p className="text-sm font-semibold">{officer?.name || "Officer"}</p><p className="text-xs capitalize text-gray-500">{role}</p></div></div><button title="Sign out" aria-label="Sign out" className="rounded-lg p-2 text-gray-500 hover:bg-gray-50" onClick={() => signOut({ callbackUrl: "/login" })}><LogOut size={19} /></button></div>
      </header>
      <div id="workspace" tabIndex={-1}>{officer?.write_restriction && <p role="status" className="m-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">{officer.write_restriction}</p>}{children}</div>
    </div>
  </OfficerContext.Provider>;
}
