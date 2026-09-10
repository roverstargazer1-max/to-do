"use client";

import { useCallback } from "react";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { TranslationKey } from "@/lib/i18n/dictionaries/en";
import type { Locale, TranslationParams } from "@/lib/i18n/types";
import { translate } from "@/lib/i18n/translate";
import { useClientLanguage } from "@/lib/i18n/useClientLanguage";

/**
 * Translation hook over the typed dictionaries (spec D-07). `t()` keys are
 * compile-checked against the dictionary; string values interpolate
 * `{param}` placeholders, function values receive the params directly
 * (English pluralization).
 *
 * SSR and the hydration render always emit English; the active language
 * takes over immediately after hydration. Switching afterwards is instant
 * and in-memory (spec D-09).
 */
export function useTranslation(): {
  t: (key: TranslationKey, params?: TranslationParams) => string;
  language: Locale;
} {
  const language = useClientLanguage();

  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams): string =>
      translate(key, params, getDictionary(language)),
    [language],
  );

  return { t, language };
}
