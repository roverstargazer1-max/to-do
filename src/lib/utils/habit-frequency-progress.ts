import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  format,
} from "date-fns";
import type { Habit, HabitEntry } from "@/lib/types/habit";
import { dayValue } from "@/lib/utils/habit-score";
import type { TranslationKey } from "@/lib/i18n/dictionaries/en";
import type { TranslationParams } from "@/lib/i18n/types";

export interface FrequencyProgress {
  completed: number;
  target: number;
  period: "day" | "week" | "month";
}

type Translate = (key: TranslationKey, params?: TranslationParams) => string;

/**
 * Whether a Habit carries a *non-trivial* Frequency target worth surfacing as a
 * ring. Every Habit is implicitly daily (`1 / day`); that resting default is
 * redundant next to the done/not-done toggle, so the ring is shown only when the
 * target is more than once a day or spans a longer period. See CONTEXT.md
 * "Frequency progress".
 */
export function hasFrequencyTarget(
  habit: Pick<Habit, "frequency_count" | "frequency_period">,
): boolean {
  const count = habit.frequency_count ?? 1;
  const period = habit.frequency_period ?? "day";
  return count > 1 || period !== "day";
}

/**
 * A Habit's Frequency rendered as progress against the current period
 * (day/week/month), per CONTEXT.md "Frequency progress" — not a Goal.
 */
export function getFrequencyProgress(
  habit: Pick<
    Habit,
    | "habit_type"
    | "target_type"
    | "target_value"
    | "frequency_count"
    | "frequency_period"
  >,
  entries: HabitEntry[],
  referenceDate: Date = new Date(),
): FrequencyProgress {
  const target = habit.frequency_count ?? 1;
  const period = habit.frequency_period ?? "day";

  let windowStart: Date;
  let windowEnd: Date;
  switch (period) {
    case "week":
      windowStart = startOfWeek(referenceDate, { weekStartsOn: 1 });
      windowEnd = endOfWeek(referenceDate, { weekStartsOn: 1 });
      break;
    case "month":
      windowStart = startOfMonth(referenceDate);
      windowEnd = endOfMonth(referenceDate);
      break;
    default:
      windowStart = referenceDate;
      windowEnd = referenceDate;
  }
  const startKey = format(windowStart, "yyyy-MM-dd");
  const endKey = format(windowEnd, "yyyy-MM-dd");

  let completed = 0;
  for (const e of entries) {
    if (e.date < startKey || e.date > endKey) continue;
    if (dayValue(e.value, habit) >= 1) completed++;
  }

  return { completed, target, period };
}

const PROGRESS_WINDOW_KEYS: Record<
  FrequencyProgress["period"],
  TranslationKey
> = {
  day: "habits.frequency.today",
  week: "habits.frequency.thisWeek",
  month: "habits.frequency.thisMonth",
};

/**
 * Locale-aware sr-only ring description, e.g. "2 of 3 this week". Receives the
 * active `t` so the label follows the UI language without this util reaching
 * into React or the store.
 */
export function frequencyProgressLabel(
  t: Translate,
  progress: FrequencyProgress,
): string {
  return t("habits.frequency.progressLabel", {
    completed: progress.completed,
    target: progress.target,
    window: t(PROGRESS_WINDOW_KEYS[progress.period]),
  });
}
