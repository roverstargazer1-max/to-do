import type { Locale } from "./types";

/**
 * Selectable UI languages. Names always render in their own script —
 * "English" / "简体中文" — never translated (spec D-01, D-09).
 */
export const LANGUAGES: ReadonlyArray<{ value: Locale; label: string }> = [
  { value: "en", label: "English" },
  { value: "zh-CN", label: "简体中文" },
];
