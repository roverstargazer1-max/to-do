import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  formatClock,
  formatDayOfMonth,
  formatFullDate,
  formatMonthDay,
  formatMonthDayYear,
  formatMonthYear,
  formatWeekday,
  formatWeekdayMonthDay,
  formatYear,
  is24HourLocale,
} from "@/lib/i18n/date-format";
import { useDateFormatter } from "@/lib/i18n/useDateFormatter";
import { useUiStore } from "@/lib/store/uiStore";

// 2024-01-01 14:30 local — Monday, so weekday/month assertions are stable.
const jan1 = new Date(2024, 0, 1, 14, 30);
const midnight = new Date(2024, 0, 1, 0, 0);

describe("date-format (en parity, ticket 03)", () => {
  it("matches the legacy date-fns token output byte-for-byte in English", () => {
    // Tokens replaced by this seam: EEE, EEEE, MMM, MMMM, MMM d, MMM yyyy,
    // MMMM yyyy, MMM d yyyy, d, yyyy, EEE, MMM d, h:mm a, HH:mm.
    expect(formatWeekday(jan1, "en", "short")).toBe("Mon");
    expect(formatWeekday(jan1, "en", "long")).toBe("Monday");
    expect(formatMonthYear(jan1, "en", "short")).toBe("Jan 2024");
    expect(formatMonthYear(jan1, "en", "long")).toBe("January 2024");
    expect(formatMonthDay(jan1, "en")).toBe("Jan 1");
    expect(formatFullDate(jan1, "en")).toBe("Monday, January 1, 2024");
    expect(formatWeekdayMonthDay(jan1, "en")).toBe("Mon, Jan 1");
    expect(formatMonthDayYear(jan1, "en")).toBe("Jan 1, 2024");
    expect(formatDayOfMonth(jan1, "en")).toBe("1");
    expect(formatYear(jan1, "en")).toBe("2024");
    expect(formatClock(jan1, "en", "12h")).toBe("2:30 PM");
    expect(formatClock(jan1, "en", "24h")).toBe("14:30");
    expect(formatClock(midnight, "en", "12h")).toBe("12:00 AM");
    expect(formatClock(midnight, "en", "24h")).toBe("00:00");
  });

  it("renders weekday/month names and date order in Chinese for zh-CN", () => {
    expect(formatWeekday(jan1, "zh-CN", "short")).toBe("周一");
    expect(formatWeekday(jan1, "zh-CN", "long")).toBe("星期一");
    expect(formatMonthYear(jan1, "zh-CN", "short")).toBe("2024年1月");
    expect(formatMonthDay(jan1, "zh-CN")).toBe("1月1日");
    expect(formatFullDate(jan1, "zh-CN")).toBe("2024年1月1日星期一");
    expect(formatWeekdayMonthDay(jan1, "zh-CN")).toBe("1月1日周一");
    expect(formatMonthDayYear(jan1, "zh-CN")).toBe("2024年1月1日");
    expect(formatClock(jan1, "zh-CN", "12h")).toBe("下午2:30");
    expect(formatClock(jan1, "zh-CN", "24h")).toBe("14:30");
  });

  it("resolves the system hour cycle per language: en 12h, zh-CN 24h", () => {
    expect(is24HourLocale("en")).toBe(false);
    expect(is24HourLocale("zh-CN")).toBe(true);
  });
});

describe("useDateFormatter (the shared locale-aware seam)", () => {
  beforeEach(() => {
    useUiStore.setState({ language: "en" });
  });

  it("reads the uiStore language", () => {
    const { result } = renderHook(() => useDateFormatter());
    expect(result.current.localeTag).toBe("en-US");
    expect(result.current.formatWeekday(jan1, "short")).toBe("Mon");
    expect(result.current.is24Hour).toBe(false);
  });

  it("flips instantly when the language changes in the store", () => {
    const { result } = renderHook(() => useDateFormatter());
    expect(result.current.formatMonthDay(jan1)).toBe("Jan 1");

    act(() => {
      useUiStore.getState().setLanguage?.("zh-CN");
    });
    expect(result.current.localeTag).toBe("zh-CN");
    expect(result.current.formatMonthDay(jan1)).toBe("1月1日");
    expect(result.current.formatClock(jan1, "24h")).toBe("14:30");
  });
});
