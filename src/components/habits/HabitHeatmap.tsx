"use client";

import React, { useMemo } from "react";
import {
  ActivityCalendar,
  type Activity,
  type BlockElement,
} from "react-activity-calendar";
import "react-activity-calendar/tooltips.css";
import { useTheme } from "next-themes";
import { subMonths, format } from "date-fns";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useDateFormatter } from "@/lib/i18n/useDateFormatter";

interface HabitHeatmapProps {
  entries: Array<{ date: string; value: number }>;
  color: string;
  className?: string;
  blockSize?: number;
  blockMargin?: number;
  startDate?: string;
}

function renderBlock(block: BlockElement, activity: Activity) {
  if (activity.level !== 0) return block;
  return React.cloneElement(block, {
    // Inset so the stroke stays inside the SVG viewBox at the edges.
    x: (block.props.x as number) + 0.5,
    y: (block.props.y as number) + 0.5,
    width: (block.props.width as number) - 1,
    height: (block.props.height as number) - 1,
    style: {
      ...block.props.style,
      stroke: "hsl(var(--border) / 0.5)",
      strokeWidth: 1,
    },
  });
}

/** GitHub-style habit activity heatmap, monochromatic on the habit color. */
export function HabitHeatmap({
  entries,
  color,
  className,
  blockSize = 9,
  blockMargin = 2,
  startDate,
}: HabitHeatmapProps) {
  const { resolvedTheme } = useTheme();
  const { t } = useTranslation();
  const { monthShorts, weekdayShorts } = useDateFormatter();
  // react-activity-calendar's weekday axis is Sunday-first; the seam's
  // weekdayShorts is ISO (Monday-first), so rotate.
  const weekdayLabels = useMemo(
    () => [...weekdayShorts().slice(6), ...weekdayShorts().slice(0, 6)],
    [weekdayShorts],
  );
  const monthLabels = useMemo(() => monthShorts(), [monthShorts]);

  const today = new Date().toISOString().split("T")[0];
  const dataMap = new Map(entries.map((e) => [e.date, e.value]));

  // Calendar only fills gaps *between* first/last date — pin the edges so new
  // habits get a full 12-month-wide grid instead of a stub a few days wide.
  const ensureDay = (date: string) => {
    if (!dataMap.has(date)) dataMap.set(date, 0);
  };
  if (startDate) ensureDay(startDate);
  ensureDay(today);
  ensureDay(format(subMonths(new Date(), 12), "yyyy-MM-dd"));

  const calendarData = Array.from(dataMap.entries())
    .map(([date, value]) => ({
      date,
      count: value,
      level: value === 0 ? 0 : Math.min(Math.ceil(value * 4), 4),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const theme = {
    dark: ["#262626", `${color}33`, `${color}66`, `${color}99`, color],
    light: ["#ebebeb", `${color}33`, `${color}66`, `${color}99`, color],
  };

  return (
    // fit-content: natural blockSize, no stretching; callers scroll it into view.
    <div className={className} style={{ width: "fit-content" }}>
      <ActivityCalendar
        data={calendarData}
        theme={theme}
        colorScheme={(resolvedTheme as "light" | "dark") || "light"}
        blockSize={blockSize}
        blockMargin={blockMargin}
        blockRadius={2}
        fontSize={12}
        renderBlock={renderBlock}
        showColorLegend={false}
        showMonthLabels={false}
        showTotalCount={false}
        labels={{
          months: monthLabels,
          weekdays: weekdayLabels,
          totalCount: t("habits.heatmap.totalCount"),
          legend: {
            less: t("habits.heatmap.less"),
            more: t("habits.heatmap.more"),
          },
        }}
      />
    </div>
  );
}
