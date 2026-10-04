import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import Navigation from "@/app/navigation";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const account = await getAuthenticatedUser();
  if (!account) redirect("/login");
  if (account.position !== "ADMIN") redirect("/");
  return <Navigation officer={account}>{children}</Navigation>;
}
