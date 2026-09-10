"use client";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/useTranslation";

export function BetaBadge({ className }: { className?: string }) {
  const { t } = useTranslation();

  return (
    <span
      className={cn(
        "px-1.5 py-0.5 rounded-md bg-brand/10 text-brand text-[9px] font-bold uppercase tracking-widest border border-brand/20 leading-none",
        className,
      )}
    >
      {t("common.badge.beta")}
    </span>
  );
}
