import type { Locale } from "./types";

/**
 * Locale-aware date/time formatting on `Intl` (spec technical decision 10,
 * ticket 03). Pure functions keyed by the active UI language — no React,
 * no store: the `useDateFormatter` seam binds them for components, and
 * non-React call sites may pass the language explicitly.
 *
 * English output is byte-identical to the legacy date-fns tokens it
 * replaces (`EEE` → "Mon", `"EEE, MMM d"` → "Mon, Jan 1", `"h:mm a"` →
 * "2:30 PM", …), so existing English assertions hold unchanged.
 * date-fns keeps only date math (`isToday`, `startOfWeek`, …) — and the
 * week start stays hardcoded Monday, untouched by this module.
 */

/** Map a supported UI language to its Intl formatting tag. */
export function intlLocale(language: Locale | undefined): string {
  return language === "zh-CN" ? "zh-CN" : "en-US";
}

// Formatter construction is expensive; the option sets here are a small
// fixed set per locale, so a keyed cache keeps re-renders cheap.
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(
  language: Locale | undefined,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${intlLocale(language)}|${JSON.stringify(options)}`;
  let cached = formatterCache.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(intlLocale(language), options);
    formatterCache.set(key, cached);
  }
  return cached;
}

/** `yyyy` → "2026" / "2026年". */
export function formatYear(date: Date, language?: Locale): string {
  return formatter(language, { year: "numeric" }).format(date);
}

/** `MMM yyyy` / `MMMM yyyy` → "Sep 2026" / "September 2026". */
export function formatMonthYear(
  date: Date,
  language: Locale | undefined,
  style: "short" | "long",
): string {
  return formatter(language, {
    month: style,
    year: "numeric",
  }).format(date);
}

/** `MMM d` → "Sep 9". */
export function formatMonthDay(
  date: Date,
  language: Locale | undefined,
): string {
  return formatter(language, { month: "short", day: "numeric" }).format(date);
}

/** `MMM` → "Sep" / "9月" (short month alone, frequency-grid column heads). */
export function formatMonthShort(
  date: Date,
  language: Locale | undefined,
): string {
  return formatter(language, { month: "short" }).format(date);
}

/** Short weekday labels in ISO order (Mon..Sun) → ["Mon", …] / ["周一", …]. */
export function weekdayShorts(language?: Locale): string[] {
  // 2024-01-01 is a Monday.
  return Array.from({ length: 7 }, (_, i) =>
    formatter(language, { weekday: "short" }).format(new Date(2024, 0, 1 + i)),
  );
}

/** Short month labels Jan..Dec → ["Jan", …] / ["1月", …]. */
export function monthShorts(language?: Locale): string[] {
  return Array.from({ length: 12 }, (_, i) =>
    formatter(language, { month: "short" }).format(new Date(2024, i, 15)),
  );
}

/** `EEEEE` → "M" / "一" (narrow weekday, rolling strip heads). */
export function formatWeekdayNarrow(
  date: Date,
  language: Locale | undefined,
): string {
  return formatter(language, { weekday: "narrow" }).format(date);
}

/** `EEEE, MMMM d, yyyy` → "Wednesday, September 9, 2026". */
export function formatFullDate(
  date: Date,
  language: Locale | undefined,
): string {
  return formatter(language, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/** `MMMM d, yyyy` → "September 9, 2026" (ticket 05, TaskDatePicker). */
export function formatLongDate(
  date: Date,
  language: Locale | undefined,
): string {
  return formatter(language, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/** `MMMM d` → "September 9" / "9月9日" (long month, no year). */
export function formatLongMonthDay(
  date: Date,
  language: Locale | undefined,
): string {
  return formatter(language, { month: "long", day: "numeric" }).format(date);
}

/** `EEE` / `EEEE` → "Wed" / "Wednesday". */
export function formatWeekday(
  date: Date,
  language: Locale | undefined,
  style: "short" | "long",
): string {
  return formatter(language, { weekday: style }).format(date);
}

/** `d` → "9" (day of month, no leading zero). */
export function formatDayOfMonth(
  date: Date,
  language: Locale | undefined,
): string {
  return formatter(language, { day: "numeric" }).format(date);
}

/** `"EEE, MMM d"` → "Wed, Sep 9". */
export function formatWeekdayMonthDay(
  date: Date,
  language: Locale | undefined,
): string {
  return formatter(language, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

/** `EEEE, MMMM d` → "Wednesday, September 9" (no year; page date lines). */
export function formatLongWeekdayMonthDay(
  date: Date,
  language: Locale | undefined,
): string {
  return formatter(language, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

/** `MMM d, yyyy` → "Sep 9, 2026". */
export function formatMonthDayYear(
  date: Date,
  language: Locale | undefined,
): string {
  return formatter(language, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/**
 * Clock time. `"12h"` → `"h:mm a"` ("2:30 PM"); `"24h"` → `"HH:mm"`
 * ("14:30"). The 12/24 choice itself is the caller's policy — the user
 * preference lives in useTimeFormat, the backup timestamp pins 12h.
 */
export function formatClock(
  date: Date,
  language: Locale | undefined,
  mode: "12h" | "24h",
): string {
  return formatter(
    language,
    mode === "24h"
      ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
      : { hour: "numeric", minute: "2-digit", hour12: true },
  ).format(date);
}

/**
 * Whether the locale's default clock is 24-hour — the "system" time
 * format detection, keyed by the active UI language instead of
 * `navigator.language` (ticket 03). Probes a fixed 14:00: an hour part
 * of "14" means 24-hour.
 */
export function is24HourLocale(language?: Locale): boolean {
  return formatter(language, { hour: "numeric" })
    .formatToParts(new Date(2024, 0, 1, 14, 0))
    .some((part) => part.type === "hour" && part.value === "14");
}
