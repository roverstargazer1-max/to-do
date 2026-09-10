"use client";

import { useMemo } from "react";
import { MetricCard } from "@/components/stats/MetricCard";
import {
  getTaskCompletionRate,
  getTaskOnTimeRate,
  getTaskCurrentStreak,
  getTaskBestStreak,
  getTaskTotalCompletions,
  type TaskOccurrence,
} from "@/lib/utils/task-streak";
import {
  CalendarCheck,
  Trophy,
  Flame,
  Target,
  CheckCircle2,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n/useTranslation";

interface TaskOverviewCardsProps {
  occurrences: TaskOccurrence[];
}

function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

export function TaskOverviewCards({ occurrences }: TaskOverviewCardsProps) {
  const { t } = useTranslation();
  const {
    completionRate,
    onTimeRate,
    currentStreak,
    bestStreak,
    totalCompletions,
  } = useMemo(
    () => ({
      completionRate: getTaskCompletionRate(occurrences),
      onTimeRate: getTaskOnTimeRate(occurrences),
      currentStreak: getTaskCurrentStreak(occurrences),
      bestStreak: getTaskBestStreak(occurrences),
      totalCompletions: getTaskTotalCompletions(occurrences),
    }),
    [occurrences],
  );

  return (
    <div className="grid grid-cols-2 gap-3">
      <MetricCard
        title={t("tasks.insights.completionRate")}
        value={formatRate(completionRate)}
        icon={Target}
        size="compact"
      />
      <MetricCard
        title={t("tasks.insights.onTime")}
        value={formatRate(onTimeRate)}
        icon={CalendarCheck}
        size="compact"
      />
      <MetricCard
        title={t("tasks.insights.currentStreak")}
        value={currentStreak}
        icon={Flame}
        size="compact"
      />
      <MetricCard
        title={t("tasks.insights.bestStreak")}
        value={bestStreak}
        icon={Trophy}
        size="compact"
      />
      <MetricCard
        title={t("tasks.insights.totalCompletions")}
        value={totalCompletions}
        icon={CheckCircle2}
        size="compact"
      />
    </div>
  );
}
