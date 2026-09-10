"use client";

import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/useTranslation";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  /** "compact" tightens padding/scale for dense contexts (e.g. insights panels); "default" is the stats-page scale. */
  size?: "default" | "compact";
  className?: string;
}

export function MetricCard({
  title,
  value,
  icon: Icon,
  trend,
  size = "default",
  className,
}: MetricCardProps) {
  const { t } = useTranslation();
  const compact = size === "compact";

  return (
    <Card
      className={cn(
        "h-full border-border",
        compact ? "p-4" : "p-4 md:p-6",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            "min-w-0",
            compact ? "space-y-1.5" : "space-y-1.5 md:space-y-2",
          )}
        >
          <p className="type-ui uppercase text-[10px] md:text-xs text-muted-foreground font-medium tracking-wider wrap-break-word">
            {title}
          </p>
          <p
            className={cn(
              "font-semibold tracking-[-0.02em]",
              compact ? "text-2xl" : "text-2xl md:text-4xl",
            )}
          >
            {value}
          </p>
          {trend && (
            <div
              role="img"
              aria-label={t("stats.metric.trendAria", {
                direction: trend.isPositive
                  ? t("stats.metric.increased")
                  : t("stats.metric.decreased"),
                value: Math.abs(trend.value),
              })}
              className={cn(
                "text-[11px] md:text-xs font-bold flex items-center gap-1 w-fit px-2 py-0.5 rounded-md mt-1.5 border transition-all",
                trend.value === 0
                  ? "text-muted-foreground bg-secondary/50 border-border/50"
                  : trend.isPositive
                    ? "text-brand bg-brand/15 border-brand/20"
                    : "text-destructive bg-destructive-surface border-destructive-surface-border",
              )}
            >
              <span className="text-xs md:text-sm" aria-hidden="true">
                {trend.isPositive ? "↑" : "↓"}
              </span>
              <span className="tracking-tight">{Math.abs(trend.value)}%</span>
            </div>
          )}
        </div>
        {Icon && (
          <div
            className={cn(
              "rounded-lg bg-secondary shrink-0",
              compact ? "p-1.5" : "p-1.5 md:p-2",
            )}
          >
            <Icon
              className={cn(
                "text-foreground/70",
                compact ? "h-4 w-4" : "h-4 w-4 md:h-5 md:w-5",
              )}
              strokeWidth={2.25}
            />
          </div>
        )}
      </div>
    </Card>
  );
}
