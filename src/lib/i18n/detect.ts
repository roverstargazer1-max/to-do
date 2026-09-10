import type { Locale } from "./types";

/**
 * First-launch language detection (spec D-02): any `zh` prefix maps to
 * zh-CN, everything else falls back to English. A manual switch recorded
 * in `kanso-ui-state` always wins — that is handled by the persist
 * rehydrate merging over this default (D-11).
 *
 * SSR-safe: returns "en" when `navigator` is unavailable, so the server
 * render is always English (D-08).
 */
export function detectInitialLanguage(): Locale {
  const navLanguage =
    typeof navigator === "undefined" ? undefined : navigator.language;
  return navLanguage?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}
