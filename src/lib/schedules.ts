/**
 * Schedule Types & Validation Helpers
 * 
 * Shared types used across the schedule management API routes.
 */

import { ActivityType, Semester, ScheduleType } from "@prisma/client";

export interface CreateScheduleGroupInput {
  schedule_number: string;
  activity_type: ActivityType;
  academic_year: string;
  semester: Semester;
}

export interface UpdateScheduleGroupInput {
  schedule_number?: string;
  activity_type?: ActivityType;
  academic_year?: string;
  semester?: Semester;
}

/**
 * FIN-23: Default inflow/outflow labels based on activity type.
 * When a schedule group is created, these sides are auto-generated.
 */
export const DEFAULT_SCHEDULE_SIDES: Record<
  ActivityType,
  { type: ScheduleType; label: string }[]
> = {
  IGP: [
    { type: "INFLOW", label: "IGP Collections" },
    { type: "OUTFLOW", label: "IGP Expenses" },
  ],
  MEMBERSHIP: [
    { type: "INFLOW", label: "Membership Fee Collections" },
  ],
  FINES: [
    { type: "INFLOW", label: "Fine Collections" },
  ],
  EVENTS: [
    { type: "INFLOW", label: "Event Collections" },
    { type: "OUTFLOW", label: "Event Expenses" },
  ],
};

/**
 * Validates the input for creating a schedule group.
 * Returns an error message string if invalid, or null if valid.
 */
export function validateScheduleGroupInput(
  input: Partial<CreateScheduleGroupInput>
): string | null {
  if (!input.schedule_number || input.schedule_number.trim() === "") {
    return "schedule_number is required";
  }
  if (!input.activity_type) {
    return "activity_type is required (IGP, MEMBERSHIP, FINES, EVENTS)";
  }
  if (!["IGP", "MEMBERSHIP", "FINES", "EVENTS"].includes(input.activity_type)) {
    return "activity_type must be one of: IGP, MEMBERSHIP, FINES, EVENTS";
  }
  if (!input.academic_year || input.academic_year.trim() === "") {
    return "academic_year is required (e.g., '2025-2026')";
  }
  if (!input.semester) {
    return "semester is required (FIRST, SECOND, SUMMER)";
  }
  if (!["FIRST", "SECOND", "SUMMER"].includes(input.semester)) {
    return "semester must be one of: FIRST, SECOND, SUMMER";
  }
  return null;
}
