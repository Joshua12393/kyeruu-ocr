import Link from "next/link";
export default function Home() {
  const pages = [["Schedules", "/schedules"], ["Disbursement vouchers", "/transactions/vouchers"], ["Acknowledgement receipts", "/transactions/receipts"], ["Document OCR", "/ocr"], ["Supporting documents", "/supporting"], ["Reconciliation", "/reconciliation"], ["Audit verification", "/verification"], ["Financial archive", "/archive"]];
  return <main className="max-w-5xl mx-auto p-8 space-y-6"><h1 className="text-3xl font-bold">Finance workspace</h1><p>Record transactions, review scanned documents, and reconcile supporting evidence.</p><div className="grid sm:grid-cols-2 gap-4">{pages.map(([name,url]) => <Link key={url} href={url} className="p-6 border bg-white rounded-xl font-semibold hover:border-blue-500">{name}</Link>)}</div></main>;
}
