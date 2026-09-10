import { useUiStore } from "@/lib/store/uiStore";
import { getDictionary } from "./dictionaries";
import type { TranslationKey } from "./dictionaries/en";
import { translate } from "./translate";
import type { TranslationParams } from "./types";

/**
 * Imperative translate for non-hook contexts — toasts, the command layer,
 * plain .ts utilities. Reads the language from the store at call time, so
 * a toast emitted after a language switch renders in the new language.
 * Components must keep using `useTranslation()` instead.
 */
export function tr(key: TranslationKey, params?: TranslationParams): string {
  const language = useUiStore.getState().language ?? "en";
  return translate(key, params, getDictionary(language));
}
