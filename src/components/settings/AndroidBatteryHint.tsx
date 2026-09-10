"use client";

import { BatteryWarning, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n/useTranslation";

export function AndroidBatteryHint({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useTranslation();

  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-2 rounded-lg border border-border/50 bg-muted/30 p-3"
    >
      <div className="flex items-start gap-2 min-w-0">
        <BatteryWarning
          className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground"
          strokeWidth={2.25}
        />
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {t("settings.androidBattery.title")}
          </span>{" "}
          {t("settings.androidBattery.body")}{" "}
          <span className="font-medium text-foreground">
            {t("settings.androidBattery.path")}
          </span>
          {t("settings.androidBattery.tail")}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("settings.androidBattery.dismiss")}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>
    </div>
  );
}
