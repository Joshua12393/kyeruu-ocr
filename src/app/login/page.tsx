import { Suspense } from "react";
import { getSessionAccount } from "@/lib/auth";
import { redirect } from "next/navigation";
import AuthFrame from "../auth-frame";
import LoginForm from "./form";
export default async function LoginPage() {
  if (await getSessionAccount()) redirect("/");
  return <AuthFrame><Suspense fallback={<p>Loading sign-in…</p>}><LoginForm /></Suspense></AuthFrame>;
}
