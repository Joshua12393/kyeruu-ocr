
import { redirect } from "next/navigation";

import { getAuthenticatedUser, getSessionAccount } from "@/lib/auth";
import { ShieldCheck } from "lucide-react";
import AuthFrame from "../auth-frame";
import PendingActions from "./actions";
import { currentTermName } from "@/lib/terms";
export default async function PendingPage() {
  const account = await getSessionAccount();
  if (!account) redirect("/login");
  if (await getAuthenticatedUser()) redirect("/");
  const term = await currentTermName();
  return <AuthFrame><span className="inline-flex rounded-xl bg-brand-50 p-3 text-brand-500"><ShieldCheck size={28} /></span><h1 className="mt-6 text-3xl font-semibold">Your account is ready</h1><p className="mt-4 text-sm leading-7 text-gray-500">You are signed in as <strong className="text-gray-700">{account.email}</strong>. Ask an Admin to assign your officer role for term <strong>{term}</strong>.</p><p className="mt-4 text-sm leading-6 text-gray-500">Financial records become available after your assignment is approved.</p><PendingActions /></AuthFrame>;
}
