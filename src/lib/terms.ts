import prisma from "./prisma";
import { ApiError } from "./api";

export async function currentTermName() {
  const settings = await prisma.omsSettings.findUnique({ where: { id: 1 } });
  const name = settings?.current_term || process.env.FINANCE_CURRENT_TERM?.trim();
  if (!name) throw new ApiError(503, "An Admin must configure the active OMS term.");
  return name;
}
export function calendarWriteError(term: { starts_on: Date | null; ends_on: Date | null; closed_at?: Date | null } | null, now = new Date()) {
  if (term?.closed_at) return "This OMS term is closed. All financial documents are read-only.";
  if (!term?.starts_on || !term.ends_on) return "Term calendar is not configured. Ask an Admin to enter its start and end dates.";
  // Calendar dates are inclusive, evaluated in the organization's Philippine timezone.
  const today = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (today < term.starts_on.toISOString().slice(0, 10)) return "This term has not started. Financial records are read-only.";
  if (today > term.ends_on.toISOString().slice(0, 10)) return "This term has ended. Financial records are read-only.";
  return null;
}
