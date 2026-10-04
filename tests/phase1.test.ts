import assert from "node:assert/strict";
import { test } from "node:test";
import { canEditFinance, canDeleteFinance, canVerifyFinance } from "../src/lib/capabilities";
import { calendarWriteError } from "../src/lib/terms";
import { DEFAULT_SCHEDULE_SIDES } from "../src/lib/schedules";
import { createGroupInput } from "../src/lib/validation";
test("Finance editing, deletion and audit capabilities never overlap", () => {
  for (const position of ["ADVISER", "PRESIDENT", "TREASURER", "ASSISTANT_TREASURER", "AUDITOR", "OTHER", "ADMIN"]) {
    const officer = { position, can_write: true };
    assert.equal(canEditFinance(officer), ["ADVISER", "PRESIDENT", "TREASURER", "ASSISTANT_TREASURER"].includes(position));
    assert.equal(canVerifyFinance(officer), position === "AUDITOR");
    assert.equal(canDeleteFinance(officer), position === "TREASURER");
    assert.equal(canEditFinance({ ...officer, can_write: false }), false);
  }
});
test("Term calendar uses inclusive Philippine dates and fails closed when unset", () => {
  const term = { starts_on: new Date("2026-06-01"), ends_on: new Date("2027-05-31") };
  assert(calendarWriteError(null));
  assert(calendarWriteError(term, new Date("2026-05-31T15:59:59Z")));
  assert.equal(calendarWriteError(term, new Date("2026-05-31T16:00:00Z")), null);
  assert.equal(calendarWriteError(term, new Date("2027-05-31T15:59:59Z")), null);
  assert(calendarWriteError(term, new Date("2027-05-31T16:00:00Z")));
});
test("Defaults and custom schedule shapes require one or two distinct directions", () => {
  assert.equal(DEFAULT_SCHEDULE_SIDES.MEMBERSHIP.length, 1);
  assert.equal(DEFAULT_SCHEDULE_SIDES.FINES.length, 1);
  assert.equal(DEFAULT_SCHEDULE_SIDES.IGP.length, 2);
  assert.equal(DEFAULT_SCHEDULE_SIDES.EVENTS.length, 2);
  const input = { schedule_number: "A", activity_type: "IGP", academic_year: "2026-2027", semester: "FIRST" };
  assert.equal(createGroupInput.safeParse({ ...input, sides: [] }).success, false);
  assert.equal(createGroupInput.safeParse({ ...input, sides: [{ type: "INFLOW", label: "A" }, { type: "INFLOW", label: "B" }] }).success, false);
});
