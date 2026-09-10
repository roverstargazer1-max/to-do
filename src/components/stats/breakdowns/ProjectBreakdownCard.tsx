"use client";

import { FolderKanban } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  StatsBarList,
  type StatsBarListItem,
} from "@/components/stats/StatsBarList";
import type { ProjectBreakdownCount } from "@/lib/hooks/useStats";
import type { Project } from "@/lib/types/task";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/useTranslation";

const TOP_N = 8;
const MUTED_COLOR = "hsl(var(--muted-foreground))";

interface ProjectBreakdownCardProps {
  data: ProjectBreakdownCount[];
  projects: Project[];
  className?: string;
}

export function ProjectBreakdownCard({
  data,
  projects,
  className,
}: ProjectBreakdownCardProps) {
  const { t } = useTranslation();
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const resolved = data
    .map((d) => ({
      key: d.projectId ?? "__none__",
      label: d.projectId
        ? (projectById.get(d.projectId)?.name ??
          t("stats.breakdown.unknownProject"))
        : t("stats.breakdown.noProject"),
      color: d.projectId
        ? (projectById.get(d.projectId)?.color ?? MUTED_COLOR)
        : MUTED_COLOR,
      count: d.count,
    }))
    .sort((a, b) => b.count - a.count);

  let rows = resolved;
  if (resolved.length > TOP_N) {
    const top = resolved.slice(0, TOP_N - 1);
    const otherCount = resolved
      .slice(TOP_N - 1)
      .reduce((sum, r) => sum + r.count, 0);
    rows = [
      ...top,
      {
        key: "__other__",
        label: t("stats.breakdown.other"),
        color: MUTED_COLOR,
        count: otherCount,
      },
    ];
  }

  const max = rows[0]?.count ?? 0;
  const items: StatsBarListItem[] = rows.map((r) => ({
    key: r.key,
    label: r.label,
    displayValue: String(r.count),
    color: r.color,
    ratio: max > 0 ? r.count / max : 0,
  }));

  return (
    <Card className={cn("p-6 border-border/50", className)}>
      <div className="space-y-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {t("stats.byProject.title")}
        </h3>
        {items.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title={t("stats.breakdown.emptyTitle")}
            description={t("stats.breakdown.emptyDescription")}
            className="py-8 gap-3"
          />
        ) : (
          <StatsBarList items={items} />
        )}
      </div>
    </Card>
  );
}
