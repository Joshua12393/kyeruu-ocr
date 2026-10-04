import { getAuthenticatedUser } from "@/lib/auth";
import AccountsWorkspace from "./workspace";
export default async function AccountsPage() {
  const officer = await getAuthenticatedUser();
  if (!officer || officer.position !== "ADMIN") return null;
  return <AccountsWorkspace />;
}
