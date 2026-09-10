"use client";

import { useSyncExternalStore } from "react";
import { useUiStore } from "@/lib/store/uiStore";
import type { Locale } from "./types";

// The store never pushes updates through this subscription. Its only job
// is to give useSyncExternalStore a server snapshot of `false`: the
// hydration render matches the SSR output (English), and the client
// snapshot `true` activates the stored language right after hydration —
// the accepted one-frame flash (spec D-08), with no hydration mismatch.
const neverSubscribe = () => () => {};

/**
 * The active UI language with the SSR/hydration gate (spec D-08): server
 * renders and the hydration frame always resolve to `"en"`; the stored
 * language takes over immediately after mount. Shared by useTranslation
 * and the locale-aware formatting seam (ticket 03) so every localized
 * surface flips in the same render.
 */
export function useClientLanguage(): Locale {
  // `?? "en"` covers pre-i18n full-state mocks in existing tests, which
  // omit the optional field — they keep asserting English.
  const language = useUiStore((state) => state.language ?? "en");
  const mounted = useSyncExternalStore(
    neverSubscribe,
    () => true,
    () => false,
  );
  return mounted ? language : "en";
}
