import type { Habit } from "@/lib/types/habit";

export class HabitValidationError extends Error {}

export function booleanFrequencyLimit(
  period: Habit["frequency_period"],
): number {
  switch (period ?? "day") {
    case "day":
      return 1;
    case "week":
      return 7;
    case "month":
      return 31;
    default:
      throw new HabitValidationError("Invalid habit frequency period");
  }
}

export function validateHabitFrequency(
  count: Habit["frequency_count"],
  period: Habit["frequency_period"],
  kind: Habit["habit_type"] = "boolean",
  imported = false,
): void {
  if (kind !== "boolean" && kind !== "measurable") {
    throw new HabitValidationError("Invalid habit type");
  }
  const limit = booleanFrequencyLimit(period);
  const target = count ?? 1;
  if (!Number.isInteger(target) || target < 1) {
    throw new HabitValidationError(
      "Habit frequency must be a positive integer",
    );
  }
  if (kind === "boolean" && !imported && target > limit) {
    throw new HabitValidationError(
      `Boolean habits can track at most ${limit} completed days per ${period ?? "day"}`,
    );
  }
}
