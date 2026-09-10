"use client";

import { useState } from "react";
import { Download, Share } from "lucide-react";
import { usePwaInstall } from "@/lib/hooks/usePwaInstall";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/useTranslation";

export function PwaInstallRow() {
  const { isIOS, canInstall, promptInstall, shouldShowRow } = usePwaInstall();
  const { t } = useTranslation();
  const [showIosInstructions, setShowIosInstructions] = useState(false);

  if (!shouldShowRow) return null;

  const Icon = isIOS ? Share : Download;
  const label = isIOS
    ? t("settings.pwa.addToHomeScreen")
    : t("settings.pwa.installApp");

  return (
    <div className="p-4 rounded-lg border border-border/50 bg-background">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-secondary/30">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">{label}</p>
        </div>
        {isIOS ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowIosInstructions((v) => !v)}
          >
            {showIosInstructions
              ? t("settings.pwa.hide")
              : t("settings.pwa.showMeHow")}
          </Button>
        ) : canInstall ? (
          <Button variant="outline" size="sm" onClick={promptInstall}>
            {t("settings.pwa.install")}
          </Button>
        ) : null}
      </div>
      {isIOS && showIosInstructions && (
        <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/50">
          {t("settings.pwa.iosHint")}
        </p>
      )}
      {!isIOS && !canInstall && (
        <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/50">
          {t("settings.pwa.browserMenuHint")}
        </p>
      )}
    </div>
  );
}
