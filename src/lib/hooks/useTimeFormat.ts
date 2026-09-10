"use client";

import { useCallback } from "react";
import { useDateFormatter } from "@/lib/i18n/useDateFormatter";
import { useUiStore } from "@/lib/store/uiStore";

/**
 * Hook to format time based on the user's preference (12h/24h/system),
 * localized through the Intl seam keyed by the active UI language
 * (ticket 03). "system" now resolves against the app language rather
 * than `navigator.language` — en → 12h, zh-CN → 24h.
 */
export const useTimeFormat = () => {
  const timeFormat = useUiStore((state) => state.timeFormat);
  const { formatClock, is24Hour } = useDateFormatter();

  const formatTime = useCallback(
    (date: Date) => {
      // 24-hour format: 14:30
      if (timeFormat === "24h") {
        return formatClock(date, "24h");
      }

      // System format: resolve the hour cycle from the active language.
      if (timeFormat === "system") {
        return formatClock(date, is24Hour ? "24h" : "12h");
      }

      // 12-hour format: 2:30 PM (default or explicit)
      return formatClock(date, "12h");
    },
    [timeFormat, formatClock, is24Hour],
  );

  return { formatTime, timeFormat };
};
