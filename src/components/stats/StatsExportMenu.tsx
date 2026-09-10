"use client";

import { useState } from "react";
import { Download, FileDown, FileJson, Loader2 } from "lucide-react";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { StatsData } from "@/lib/hooks/useStats";
import type { StatsPeriod } from "@/lib/types/stats";
import {
  analyticsFilename,
  dailyRollupToCsv,
  statsToExportJson,
  triggerDownload,
} from "@/lib/utils/stats-export";

interface StatsExportMenuProps {
  stats: StatsData | undefined;
  period: StatsPeriod;
}

export function StatsExportMenu({ stats, period }: StatsExportMenuProps) {
  const { trigger } = useHaptic();
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState<null | "csv" | "json">(null);

  const noData = !stats || stats.dailyTrend.length === 0;

  const handleExport = (format: "csv" | "json") => {
    if (!stats) return;
    trigger("toggle");
    setIsExporting(format);
    try {
      const content =
        format === "csv"
          ? dailyRollupToCsv(stats.dailyTrend)
          : JSON.stringify(statsToExportJson(stats, { period }), null, 2);
      const mime = format === "csv" ? "text/csv" : "application/json";
      triggerDownload(
        analyticsFilename("stats", format, { period }),
        content,
        mime,
      );
      notify.success(
        t("stats.export.exportedToast", { format: format.toUpperCase() }),
      );
      trigger("success");
    } catch (err) {
      console.error(`${format.toUpperCase()} export failed:`, err);
      notify.error(
        t("stats.export.failedToast", { format: format.toUpperCase() }),
      );
      trigger("thud");
    } finally {
      setIsExporting(null);
    }
  };

  const busy = isExporting !== null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={noData || busy}
          className="gap-2 h-9 border-border/60 hover:bg-secondary/40 transition-all font-medium"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
          ) : (
            <Download className="h-4 w-4" strokeWidth={2.25} />
          )}
          <span className="hidden sm:inline">{t("stats.export.button")}</span>
          <span className="sr-only">{t("stats.export.srLabel")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 border-border/40">
        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {t("stats.export.menuLabel")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => handleExport("csv")}
          disabled={isExporting === "csv"}
          className="cursor-pointer gap-2 py-2"
        >
          <FileDown className="h-4 w-4 text-brand" />
          <span>
            {isExporting === "csv"
              ? t("stats.export.exporting")
              : t("stats.export.csv")}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleExport("json")}
          disabled={isExporting === "json"}
          className="cursor-pointer gap-2 py-2"
        >
          <FileJson className="h-4 w-4 text-brand" />
          <span>
            {isExporting === "json"
              ? t("stats.export.exporting")
              : t("stats.export.json")}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
