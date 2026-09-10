import type { Locale } from "../types";
import type { Dictionary } from "./en";
import { en } from "./en";
import { zhCN } from "./zh-CN";

/**
 * Runtime fallback (spec D-03): a key missing from zh-CN resolves to the
 * English string — merge order `{ ...en, ...zhCN }`. The `Dictionary`
 * type makes a missing key unreachable in practice; the merge is the
 * safety net.
 */
const DICTIONARIES: Record<Locale, Dictionary> = {
  en,
  "zh-CN": { ...en, ...zhCN },
};

/** The effective dictionary for a locale, with English fallback merged in. */
export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}
