"use client";

import { useTranslation } from "@/lib/i18n/useTranslation";

/**
 * Suspense fallback for the root page. Lives in a client component so the
 * label follows the active locale — `app/page.tsx` is a Server Component
 * (PERF-01) and can't read the store itself (spec D-09).
 */
export function HomeLoadingFallback() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground">{t("common.loading")}</p>
    </div>
  );
}
