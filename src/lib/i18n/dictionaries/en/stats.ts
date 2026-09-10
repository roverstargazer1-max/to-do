import type { DictionaryValue, TranslationParams } from "../../types";

/**
 * English `stats` module (ticket 06). Terminology per CONTEXT.md:
 * Stats → 统计, Insights → 洞察 (different concepts — Stats aggregates
 * across all domains, Insights is per-entity deep-dive).
 */
export const stats = {
  // Page header
  "stats.title": "Statistics",
  "stats.subtitle": "Track your productivity and progress",

  // Period labels (StatsClient PERIOD_LABELS)
  "stats.period.last7days": "Last 7 days",
  "stats.period.last30days": "Last 30 days",
  "stats.period.last90days": "Last 90 days",
  "stats.period.lastYear": "Last year",
  "stats.period.allTime": "All time",
  "stats.period.allShort": "All",
  "stats.period.loadingAll": "Loading all-time data",

  // Overview metric cards
  "stats.metric.totalFocus": "Total Focus",
  "stats.metric.sessions": "Sessions",
  "stats.metric.tasks": "Tasks",
  "stats.metric.streak": "Streak",
  "stats.metric.rate": "Rate",
  "stats.metric.habits": "Habits",
  "stats.metric.trendAria": (params: TranslationParams): string =>
    `${params.direction} by ${params.value}% compared to last period`,
  "stats.metric.increased": "Increased",
  "stats.metric.decreased": "Decreased",

  // Goals card
  "stats.goals.title": "Goals",
  "stats.goals.subtitle":
    "Daily and weekly targets — not affected by the period selector",
  "stats.goals.setupPrompt":
    "Set a daily or weekly goal to track progress here",
  "stats.goals.ringLabel": (params: TranslationParams): string =>
    `${params.value} of ${params.target}${params.unit} — ${params.label}`,
  "stats.goals.dailyFocus": "Daily Focus",
  "stats.goals.weeklyFocus": "Weekly Focus",
  "stats.goals.dailyTasks": "Daily Tasks",
  "stats.goals.weeklyTasks": "Weekly Tasks",

  // Focus trend chart
  "stats.trend.title": "Trend",
  "stats.trend.defaultPeriod": "Last 7 days (ends today)",
  "stats.trend.focusHours": "Focus hours",
  "stats.trend.tasksCompleted": "Tasks completed",
  "stats.trend.emptyTitle": "No activity yet",
  "stats.trend.emptyDescription":
    "Complete a focus session or task to see your trend here.",

  // Time-of-day heatmap
  "stats.timeOfDay.title": "Focus by Time of Day",
  "stats.timeOfDay.subtitle": "When you focus most, by hour and weekday",
  "stats.timeOfDay.emptyTitle": "No focus sessions yet",
  "stats.timeOfDay.emptyDescription":
    "Complete a focus session to see your patterns here.",
  "stats.timeOfDay.cellLabel": (params: TranslationParams): string =>
    `${params.weekday} ${params.hour}:00 — ${params.minutes}m`,

  // Habit score comparison
  "stats.habitComparison.title": "Habit Score Comparison",
  "stats.habitComparison.subtitle":
    "Current Score — not affected by the period selector",
  "stats.habitComparison.emptyTitle": "No habits yet",
  "stats.habitComparison.emptyDescription":
    "Create a habit to see its Score here.",

  // Projections card
  "stats.projections.title": "Projections",
  "stats.projections.subtitle":
    "Estimates from your recent pace — not a guarantee",
  "stats.projections.emptyTitle": "Not enough data yet",
  "stats.projections.emptyDescription":
    "Log a few days of activity to see a pace-based projection.",
  "stats.projections.tasksThisMonth": "Tasks this month",
  "stats.projections.focusThisMonth": "Focus this month",
  "stats.projections.tasksCaption": (params: TranslationParams): string =>
    `${params.count} completed so far`,
  "stats.projections.focusCaption": (params: TranslationParams): string =>
    `${params.hours}h logged so far`,
  "stats.projections.streaksAtRisk": "Streaks at risk",
  "stats.projections.streakRisk": (params: TranslationParams): string =>
    `${params.count}d streak — log today to keep it`,

  // Breakdown cards
  "stats.byPriority.title": "By Priority",
  "stats.byProject.title": "By Project",
  "stats.breakdown.emptyTitle": "No completed tasks",
  "stats.breakdown.emptyDescription": "Complete a task to see this breakdown.",
  "stats.breakdown.unknownProject": "Unknown project",
  "stats.breakdown.noProject": "No project",
  "stats.breakdown.other": "Other",

  // Export menu
  "stats.export.button": "Export",
  "stats.export.srLabel": "Export statistics",
  "stats.export.menuLabel": "Export analytics",
  "stats.export.csv": "Daily rollup (CSV)",
  "stats.export.json": "Full stats (JSON)",
  "stats.export.exporting": "Exporting…",
  "stats.export.exportedToast": (params: TranslationParams): string =>
    `Stats exported as ${params.format}`,
  "stats.export.failedToast": (params: TranslationParams): string =>
    `Failed to export ${params.format}`,

  // Activity heatmap
  "stats.activity.title": "Activity Heatmap",
  "stats.activity.activeDays": (params: TranslationParams): string =>
    `${params.count} active days in the past year`,
  "stats.activity.tooltip": (params: TranslationParams): string =>
    `${params.date}: ${params.focus}h focus • ${params.tasks} tasks`,
  "stats.activity.less": "Less",
  "stats.activity.more": "More",
} satisfies Record<string, DictionaryValue>;
