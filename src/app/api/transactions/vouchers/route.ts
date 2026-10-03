import { listTransactions, createTransaction } from "@/lib/transactions";
export async function GET(req: Request) { return listTransactions(req, "DV"); }
export async function POST(req: Request) { return createTransaction(req, "DV"); }
