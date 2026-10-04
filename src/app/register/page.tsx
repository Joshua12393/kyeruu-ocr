import { getSessionAccount } from "@/lib/auth";
import { redirect } from "next/navigation";
import AuthFrame from "../auth-frame";
import RegisterForm from "./form";
export default async function RegisterPage() {
  if (await getSessionAccount()) redirect("/");
  return <AuthFrame><RegisterForm /></AuthFrame>;
}
