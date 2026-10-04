import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { getAuthenticatedUser } from "@/lib/auth";
import Navigation from "@/app/navigation";
export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const officer = await getAuthenticatedUser();
  if (!officer) redirect("/access-pending");
  if (officer.position === "ADMIN") redirect("/accounts");
  return <Navigation officer={officer}>{children}</Navigation>;
}
