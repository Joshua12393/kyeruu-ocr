export const FINANCE_EDITORS = ["ADVISER", "PRESIDENT", "TREASURER", "ASSISTANT_TREASURER"] as const;
type Officer = { position: string; can_write?: boolean } | null;
export function canEditFinance(officer: Officer) {
  return !!officer && officer.can_write === true && (FINANCE_EDITORS as readonly string[]).includes(officer.position);
}
export function canDeleteFinance(officer: Officer) { return !!officer && officer.can_write === true && officer.position === "TREASURER"; }
export function canVerifyFinance(officer: Officer) { return !!officer && officer.can_write === true && officer.position === "AUDITOR"; }
