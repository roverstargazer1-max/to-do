import { intlLocale } from "@/lib/i18n/date-format";
import type { Locale } from "@/lib/i18n/types";

export const HOUR_HEIGHT = 120; // px per hour row
export const HEADER_HEIGHT = 80; // day-column header row, matches h-20
export const hours = Array.from({ length: 24 }).map((_, i) => i);

/**
 * Gutter hour labels ("1 AM"… in en-US), keyed by the active UI language.
 * Cached per locale like the date-format seam; en output matches the legacy
 * date-fns "h a" tokens byte-for-byte.
 */
const hourLabelCache = new Map<string, string[]>();

export function hourLabels(language?: Locale): string[] {
  const tag = intlLocale(language);
  let cached = hourLabelCache.get(tag);
  if (!cached) {
    const fmt = new Intl.DateTimeFormat(tag, { hour: "numeric" });
    cached = hours.map((hour) =>
      fmt
        .formatToParts(new Date(2024, 0, 1, hour, 0))
        .map((p) => p.value)
        .join(" "),
    );
    hourLabelCache.set(tag, cached);
  }
  return cached;
}

/** scrollTop that centers the current-time indicator in a viewport of this height. */
export function scrollTopForNow(clientHeight: number): number {
  const now = new Date();
  const minutesFromMidnight = now.getHours() * 60 + now.getMinutes();
  const indicatorTop = (minutesFromMidnight / 60) * HOUR_HEIGHT + HEADER_HEIGHT;
  return Math.max(0, indicatorTop - clientHeight / 2);
}
