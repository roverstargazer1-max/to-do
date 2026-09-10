import type { DictionaryValue, TranslationParams } from "../../types";

/**
 * zh-CN `stats` module — mirrors `dictionaries/en/stats.ts` exactly
 * (enforced by the `Dictionary` type at the locale index). Terminology
 * per CONTEXT.md: Stats→统计, Insights→洞察, Score→得分.
 */
export const stats = {
  // Page header
  "stats.title": "统计",
  "stats.subtitle": "追踪你的生产力与进展",

  // Period labels (StatsClient PERIOD_LABELS)
  "stats.period.last7days": "最近 7 天",
  "stats.period.last30days": "最近 30 天",
  "stats.period.last90days": "最近 90 天",
  "stats.period.lastYear": "最近一年",
  "stats.period.allTime": "全部",
  "stats.period.allShort": "全部",
  "stats.period.loadingAll": "正在加载全部数据",

  // Overview metric cards
  "stats.metric.totalFocus": "总专注",
  "stats.metric.sessions": "次数",
  "stats.metric.tasks": "任务",
  "stats.metric.streak": "连续",
  "stats.metric.rate": "完成率",
  "stats.metric.habits": "习惯",
  "stats.metric.trendAria": (params: TranslationParams): string =>
    `较上一时段${params.direction} ${params.value}%`,
  "stats.metric.increased": "上升",
  "stats.metric.decreased": "下降",

  // Goals card
  "stats.goals.title": "目标",
  "stats.goals.subtitle": "每日与每周目标 — 不受周期选择影响",
  "stats.goals.setupPrompt": "设置一个每日或每周目标，在这里追踪进展",
  "stats.goals.ringLabel": (params: TranslationParams): string =>
    `${params.label} — ${params.value} / ${params.target}${params.unit}`,
  "stats.goals.dailyFocus": "每日专注",
  "stats.goals.weeklyFocus": "每周专注",
  "stats.goals.dailyTasks": "每日任务",
  "stats.goals.weeklyTasks": "每周任务",

  // Focus trend chart
  "stats.trend.title": "趋势",
  "stats.trend.defaultPeriod": "最近 7 天（截至今天）",
  "stats.trend.focusHours": "专注时长",
  "stats.trend.tasksCompleted": "完成任务",
  "stats.trend.emptyTitle": "暂无活动",
  "stats.trend.emptyDescription": "完成一次专注或任务后即可看到趋势。",

  // Time-of-day heatmap
  "stats.timeOfDay.title": "专注时段分布",
  "stats.timeOfDay.subtitle": "你在一周中何时最专注，按小时与星期统计",
  "stats.timeOfDay.emptyTitle": "还没有专注记录",
  "stats.timeOfDay.emptyDescription": "完成一次专注后即可看到你的规律。",
  "stats.timeOfDay.cellLabel": (params: TranslationParams): string =>
    `${params.weekday} ${params.hour}:00 — ${params.minutes} 分钟`,

  // Habit score comparison
  "stats.habitComparison.title": "习惯得分对比",
  "stats.habitComparison.subtitle": "当前得分 — 不受周期选择影响",
  "stats.habitComparison.emptyTitle": "还没有习惯",
  "stats.habitComparison.emptyDescription":
    "创建一个习惯后即可在这里看到得分。",

  // Projections card
  "stats.projections.title": "预测",
  "stats.projections.subtitle": "基于近期节奏的估算 — 不构成承诺",
  "stats.projections.emptyTitle": "数据尚不足",
  "stats.projections.emptyDescription":
    "多记录几天活动后即可看到基于节奏的预测。",
  "stats.projections.tasksThisMonth": "本月任务",
  "stats.projections.focusThisMonth": "本月专注",
  "stats.projections.tasksCaption": (params: TranslationParams): string =>
    `已完成 ${params.count} 个`,
  "stats.projections.focusCaption": (params: TranslationParams): string =>
    `已记录 ${params.hours} 小时`,
  "stats.projections.streaksAtRisk": "连续记录告急",
  "stats.projections.streakRisk": (params: TranslationParams): string =>
    `连续 ${params.count} 天 — 今天打卡以保住记录`,

  // Breakdown cards
  "stats.byPriority.title": "按优先级",
  "stats.byProject.title": "按项目",
  "stats.breakdown.emptyTitle": "暂无已完成任务",
  "stats.breakdown.emptyDescription": "完成任务后即可看到此分布。",
  "stats.breakdown.unknownProject": "未知项目",
  "stats.breakdown.noProject": "无项目",
  "stats.breakdown.other": "其他",

  // Export menu
  "stats.export.button": "导出",
  "stats.export.srLabel": "导出统计数据",
  "stats.export.menuLabel": "导出分析数据",
  "stats.export.csv": "每日汇总 (CSV)",
  "stats.export.json": "完整统计 (JSON)",
  "stats.export.exporting": "导出中…",
  "stats.export.exportedToast": (params: TranslationParams): string =>
    `统计已导出为 ${params.format}`,
  "stats.export.failedToast": (params: TranslationParams): string =>
    `${params.format} 导出失败`,

  // Activity heatmap
  "stats.activity.title": "活动热力图",
  "stats.activity.activeDays": (params: TranslationParams): string =>
    `过去一年有 ${params.count} 个活跃日`,
  "stats.activity.tooltip": (params: TranslationParams): string =>
    `${params.date}：专注 ${params.focus} 小时 • 任务 ${params.tasks} 个`,
  "stats.activity.less": "少",
  "stats.activity.more": "多",
} satisfies Record<string, DictionaryValue>;
