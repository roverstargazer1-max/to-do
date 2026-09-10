"use client";

import { useMemo } from "react";
import {
  formatClock,
  formatDayOfMonth,
  formatFullDate,
  formatLongDate,
  formatLongMonthDay,
  formatMonthDay,
  formatMonthDayYear,
  formatMonthShort,
  formatMonthYear,
  formatWeekday,
  formatWeekdayMonthDay,
  formatWeekdayNarrow,
  formatLongWeekdayMonthDay,
  formatYear,
  intlLocale,
  is24HourLocale,
  monthShorts,
  weekdayShorts,
} from "./date-format";
import { useClientLanguage } from "./useClientLanguage";

/**
 * The locale-aware formatting seam (ticket 03): reads the uiStore
 * language through the SSR/hydration gate and backs every migrated
 * call site with Intl-based formatters. Bound functions are stable per
 * language, so memoized consumers only recompute on an actual switch.
 */
export function useDateFormatter() {
  const language = useClientLanguage();

  return useMemo(
    () => ({
      language,
      localeTag: intlLocale(language),
      is24Hour: is24HourLocale(language),
      formatYear: (date: Date) => formatYear(date, language),
      formatMonthYear: (date: Date, style: "short" | "long") =>
        formatMonthYear(date, language, style),
      formatMonthDay: (date: Date) => formatMonthDay(date, language),
      formatLongMonthDay: (date: Date) => formatLongMonthDay(date, language),
      formatMonthShort: (date: Date) => formatMonthShort(date, language),
      monthShorts: () => monthShorts(language),
      weekdayShorts: () => weekdayShorts(language),
      formatWeekdayNarrow: (date: Date) => formatWeekdayNarrow(date, language),
      formatFullDate: (date: Date) => formatFullDate(date, language),
      formatLongDate: (date: Date) => formatLongDate(date, language),
      formatWeekday: (date: Date, style: "short" | "long") =>
        formatWeekday(date, language, style),
      formatDayOfMonth: (date: Date) => formatDayOfMonth(date, language),
      formatWeekdayMonthDay: (date: Date) =>
        formatWeekdayMonthDay(date, language),
      formatLongWeekdayMonthDay: (date: Date) =>
        formatLongWeekdayMonthDay(date, language),
      formatMonthDayYear: (date: Date) => formatMonthDayYear(date, language),
      formatClock: (date: Date, mode: "12h" | "24h") =>
        formatClock(date, language, mode),
    }),
    [language],
  );
}
