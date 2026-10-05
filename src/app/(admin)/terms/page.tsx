import prisma from "@/lib/prisma";
import { currentTermName } from "@/lib/terms";
import TermWorkspace from "./workspace";
export default async function TermsPage() {
  const terms = await prisma.academicTerm.findMany({ orderBy: { name: "desc" } });
  const current = await currentTermName();
  const settings = await prisma.omsSettings.findUnique({ where: { id: 1 } });
  return <TermWorkspace current={current} version={settings?.version || 0} terms={terms.map(term => ({ closed_at: term.closed_at?.toISOString() || null, name: term.name, starts_on: term.starts_on?.toISOString().slice(0, 10) || "", ends_on: term.ends_on?.toISOString().slice(0, 10) || "" }))} />;
}
