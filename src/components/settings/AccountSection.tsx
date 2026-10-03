"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HardDrive, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { ICON_LED_ROW_CLASS } from "@/components/settings/iconLedRowClass";
import { SETTINGS_CARD_CLASS } from "@/components/settings/settingsCardClass";
import { useTranslation } from "@/lib/i18n/useTranslation";

export function AccountSection() {
  const { t } = useTranslation();
  return (
    <Card className={SETTINGS_CARD_CLASS}>
      <CardHeader className="pb-3 px-4 pt-5">
        <CardTitle className="flex items-center gap-2 text-base font-medium tracking-tight">
          <HardDrive className="h-4 w-4 text-brand" strokeWidth={2.25} />
          {t("settings.account.local.title")}
        </CardTitle>
        <CardDescription className="text-xs text-muted-foreground/80">
          {t("settings.account.local.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 space-y-2.5">
        <div className={cn(ICON_LED_ROW_CLASS, "justify-between")}>
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-foreground/70" />
            <div>
              <p className="text-sm font-medium">
                {t("settings.account.local.database")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("settings.account.local.backupHint")}
              </p>
            </div>
          </div>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            {t("settings.account.local.status")}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
