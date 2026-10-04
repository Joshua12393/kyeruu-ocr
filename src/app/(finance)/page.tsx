import { canEditFinance } from "@/lib/capabilities";
import Link from "next/link";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, BookOpen, CircleCheck, FileText, ScanLine, ShieldCheck, Wallet } from "lucide-react";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";

const money = (value: Prisma.Decimal) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 }).format(Number(value.toString()));
export default async function Home() {
  const officer = await getAuthenticatedUser();
  if (!officer) return null;
  if (officer.position === "ADMIN") redirect("/accounts");
  const canEdit = canEditFinance(officer);
  let data;
  try {
    data = await Promise.all([
      prisma.acknowledgementReceipt.aggregate({ _sum: { amount: true }, _count: true }),
      prisma.disbursementVoucher.aggregate({ _sum: { amount: true }, _count: true }),
      prisma.scheduleGroup.count({ where: { is_closed: false } }),
      prisma.documentScan.count(),
      prisma.disbursementVoucher.count({ where: { is_verified: false } }),
      prisma.acknowledgementReceipt.count({ where: { is_verified: false } }),
      prisma.documentScan.count({ where: { disbursement_vouchers: { none: {} }, acknowledgement_receipts: { none: {} }, receipts: { none: {} }, ar_supporting_documents: { none: {} } } }),
      prisma.disbursementVoucher.findMany({ take: 5, orderBy: { created_at: "desc" }, select: { id: true, control_number: true, purpose: true, date: true, amount: true, is_verified: true, created_at: true } }),
      prisma.acknowledgementReceipt.findMany({ take: 5, orderBy: { created_at: "desc" }, select: { id: true, control_number: true, purpose: true, date: true, amount: true, is_verified: true, created_at: true } }),
    ]);
  } catch {
    return <main className="mx-auto max-w-4xl p-8"><section role="alert" className="finance-card p-8"><h1 className="text-xl font-semibold">The finance dashboard is temporarily unavailable</h1><p className="mt-3 text-gray-500">Check that your database server is running, then reload this page.</p><Link href="/" className="finance-primary mt-5">Try again</Link></section></main>;
  }
  const [inflow, outflow, groups, scanCount, pendingDV, pendingAR, unlinkedScans, vouchers, receipts] = data;
  const received = inflow._sum.amount || new Prisma.Decimal(0);
  const released = outflow._sum.amount || new Prisma.Decimal(0);
  const pending = pendingDV + pendingAR;
  const total = inflow._count + outflow._count;
  const recent = [...vouchers.map(row => ({ ...row, kind: "DV", href: "/transactions/vouchers" })), ...receipts.map(row => ({ ...row, kind: "AR", href: "/transactions/receipts" }))].sort((a,b) => b.created_at.getTime() - a.created_at.getTime()).slice(0,5);
  const metrics = [{ label: "Total inflow", value: money(received), detail: `${inflow._count} acknowledgement receipts`, icon: ArrowDownLeft, tone: "bg-emerald-50 text-emerald-600" }, { label: "Total outflow", value: money(released), detail: `${outflow._count} disbursement vouchers`, icon: ArrowUpRight, tone: "bg-orange-50 text-orange-600" }, { label: "Recorded balance", value: money(received.minus(released)), detail: "Recorded inflow minus outflow", icon: Wallet, tone: "bg-brand-50 text-brand-500" }, { label: "Awaiting verification", value: String(pending), detail: `${total - pending} of ${total} records verified`, icon: ShieldCheck, tone: "bg-violet-50 text-violet-600" }];
  return <main className="mx-auto max-w-[1500px] space-y-7 p-5 sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="mb-1 text-sm text-gray-500">Your finance workspace, at a glance</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Welcome back, {officer.name}<span className="text-brand-500">.</span></h1></div><Link href={canEdit ? "/ocr" : "/archive"} className="finance-primary">{canEdit ? <ScanLine size={18} /> : <FileText size={18} />}{canEdit ? "Scan a document" : "Browse financial records"}</Link></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ label, value, detail, icon: Icon, tone }) => <section key={label} className="finance-card p-5"><div className="mb-4 flex items-center justify-between"><span className={`grid h-11 w-11 place-items-center rounded-xl ${tone}`}><Icon size={22} /></span><span className="text-xs text-gray-400">All records</span></div><p className="text-sm text-gray-500">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p><p className="mt-2 text-xs text-gray-500">{detail}</p></section>)}</div>
    <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
      <section className="finance-card overflow-hidden"><div className="flex items-center justify-between border-b px-5 py-5 sm:px-6"><div><h2 className="font-semibold">Recent transactions</h2><p className="mt-1 text-sm text-gray-500">Latest entries across receipts and vouchers</p></div><Link href="/archive" className="text-sm font-medium text-brand-500">View all ↗</Link></div>
        {recent.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">The five most recently recorded transactions</caption><thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="px-6 py-3 font-medium">Transaction</th><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Amount</th><th className="px-4 py-3 font-medium">Status</th></tr></thead><tbody>{recent.map(row => <tr key={`${row.kind}-${row.id}`} className="border-t"><td className="max-w-60 px-6 py-4"><Link className="font-semibold hover:text-brand-500" href={row.href}>{row.control_number}</Link><p className="mt-1 truncate text-xs text-gray-500">{row.kind === "AR" ? "Receipt" : "Voucher"} · {row.purpose}</p></td><td className="whitespace-nowrap px-4 py-4 text-gray-500">{row.date.toISOString().slice(0,10)}</td><td className="whitespace-nowrap px-4 py-4 font-medium tabular-nums">{money(row.amount)}</td><td className="px-4 py-4"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${row.is_verified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{row.is_verified ? "Verified" : "Pending review"}</span></td></tr>)}</tbody></table></div> : <div className="flex min-h-65 flex-col items-center justify-center px-6 py-10 text-center"><span className="mb-4 rounded-2xl bg-gray-50 p-4 text-gray-400"><FileText size={28} /></span><h3 className="font-semibold">Your records will appear here</h3><p className="mt-2 max-w-sm text-sm leading-6 text-gray-500">{canEdit ? "Create a schedule, then scan a document or enter your first transaction." : "Once a Treasurer records a transaction, you can follow it here."}</p><Link href="/schedules" className="mt-5 text-sm font-semibold text-brand-500">Explore schedules →</Link></div>}
      </section>
      <section className="finance-card p-6"><h2 className="font-semibold">Needs attention</h2><p className="mt-1 text-sm text-gray-500">Keep your records complete and ready for audit.</p><div className="mt-6 space-y-3">{[{ label: "Pending verification", value: pending, url: "/verification", icon: ShieldCheck, note: "Review transaction records" }, { label: "Unlinked scans", value: unlinkedScans, url: "/reconciliation", icon: ScanLine, note: "Connect scans to financial evidence" }, { label: "Open schedule groups", value: groups, url: "/schedules", icon: BookOpen, note: "View active activities" }].map(({ label,value,url,icon: Icon,note }) => <Link key={url} href={url} className="flex items-center gap-3 rounded-xl border p-4 transition hover:border-brand-500/40 hover:bg-brand-50/30"><Icon size={20} className="shrink-0 text-gray-500" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{label}</p><p className="mt-1 text-xs text-gray-500">{note}</p></div><span className="text-lg font-semibold tabular-nums">{value}</span><ArrowRight size={16} className="text-gray-400" /></Link>)}</div><p className="mt-5 flex items-center gap-2 text-xs text-gray-500"><CircleCheck size={15} /> {scanCount} documents saved in the workspace</p></section>
    </div>
    <section className="rounded-2xl border border-brand-100 bg-brand-50/50 p-6"><div className="flex flex-wrap items-center justify-between gap-5"><div className="flex items-start gap-4"><div className="rounded-xl bg-white p-3 text-brand-500"><ScanLine size={26} /></div><div><h2 className="font-semibold">From document to financial record</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600">Upload a scan, review the extracted values, and connect the evidence to a transaction. {canEdit ? "You can create and edit transaction drafts." : "Your role has viewing access. Editing officers manage entries; Auditors verify them."}</p></div></div><Link href="/ocr" className="finance-secondary">Open OCR workspace <ArrowRight size={16} /></Link></div></section>
    <p className="text-xs text-gray-400">Figures cover all recorded schedule groups. The active officer term determines your access.</p>
  </main>;
}
