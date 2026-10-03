import { editTransaction, deleteTransaction } from "@/lib/transactions";
import { positiveId } from "@/lib/validation";
import { apiError } from "@/lib/api";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(req: Request, context: Context) {
  try { return editTransaction(req, "AR", positiveId.parse((await context.params).id)); } catch (error) { return apiError(error); }
}
export async function DELETE(req: Request, context: Context) {
  try { return deleteTransaction(req, "AR", positiveId.parse((await context.params).id)); } catch (error) { return apiError(error); }
}
