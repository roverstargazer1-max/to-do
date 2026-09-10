import { parseISO, isToday, isTomorrow, isBefore, startOfDay } from "date-fns";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { formatMonthDay } from "@/lib/i18n/date-format";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/types";

export const priorityTextClasses: Record<1 | 2 | 3 | 4, string> = {
  1: "text-foreground font-bold",
  2: "text-foreground font-semibold",
  3: "text-foreground/90 font-medium",
  4: "text-muted-foreground",
};

// All priorities share the same high-contrast tokens, kept explicit per key
// for predictability.
export const priorityCheckboxClasses: Record<1 | 2 | 3 | 4, string> = {
  1: "border-foreground/80 data-[state=checked]:bg-foreground data-[state=checked]:border-foreground",
  2: "border-foreground/80 data-[state=checked]:bg-foreground data-[state=checked]:border-foreground",
  3: "border-foreground/80 data-[state=checked]:bg-foreground data-[state=checked]:border-foreground",
  4: "border-foreground/80 data-[state=checked]:bg-foreground data-[state=checked]:border-foreground",
};

/**
 * Due-date chip text: "Today"/"Tomorrow" from the dictionary, otherwise
 * `MMM d` via the Intl seam. Pure in `language` — callers pass the gated
 * uiStore language so the chip re-renders on a locale switch (D-10).
 */
export function formatDueDate(dateString: string, language?: Locale): string {
  const date = parseISO(dateString);
  const dictionary = getDictionary(language ?? "en");
  if (isToday(date))
    return translate("tasks.dateGroup.today", undefined, dictionary);
  if (isTomorrow(date))
    return translate("tasks.dateGroup.tomorrow", undefined, dictionary);
  return formatMonthDay(date, language);
}

export function isOverdue(dateString: string | null | undefined): boolean {
  if (!dateString) return false;
  const date = parseISO(dateString);
  return isBefore(date, startOfDay(new Date())) && !isToday(date);
}

/**
 * Stable DOM id for a task card, used as the `aria-activedescendant` target
 * on the scroll container that owns keyboard (Vim) navigation.
 */
export function taskDomId(taskId: string): string {
  return `task-item-${taskId}`;
}
