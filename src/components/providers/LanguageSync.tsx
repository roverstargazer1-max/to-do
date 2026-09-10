"use client";

import { useEffect } from "react";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { useUiStore } from "@/lib/store/uiStore";

/**
 * Keeps `<html lang>` and `document.title` in sync with the active UI
 * language (spec D-06, D-08). Client-only: the server markup stays the
 * English SSR default, and this effect applies the persisted language
 * once mounted — the accepted one-frame flash, no hydration mismatch.
 * The title is sourced from the dictionary (`common.appTitle`); the root
 * layout's static metadata remains the English default.
 */
export function LanguageSync() {
  const language = useUiStore((state) => state.language ?? "en");

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = getDictionary(language)["common.appTitle"];
  }, [language]);

  return null;
}
