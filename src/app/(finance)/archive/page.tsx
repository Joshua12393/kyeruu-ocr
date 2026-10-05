import FinanceBrowser from "@/app/finance-browser";
export default async function Archive({ searchParams }: { searchParams: Promise<Record<string,string>> }) { return <FinanceBrowser title="Financial archive & supplementary totals" initial={await searchParams} />; }
