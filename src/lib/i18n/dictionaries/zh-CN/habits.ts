import type { DictionaryValue, TranslationParams } from "../../types";

/**
 * zh-CN `habits` module — mirrors `dictionaries/en/habits.ts` exactly
 * (enforced by the `Dictionary` type at the locale index). Domain
 * vocabulary per CONTEXT.md: Habit→习惯, Entry→记录, Streak→连续
 * (day-counting), Score→得分 (strength), Goal→目标, Frequency→频率.
 */
export const habits = {
  // Page header & view toggle
  "habits.header.newHabit": "新建习惯",
  "habits.view.grid": "网格",
  "habits.view.compact": "紧凑",

  // Habits page (app/habits)
  "habits.page.title": "习惯",
  "habits.page.loadError": "习惯加载失败",
  "habits.page.emptyTitle": "还没有习惯",
  "habits.page.emptyDescription":
    "小改变带来大成果。创建第一个习惯，开始追踪。",
  "habits.page.createHabit": "创建习惯",

  // Options menu (import)
  "habits.options.srLabel": "习惯选项",
  "habits.options.data": "习惯数据",
  "habits.options.loop": "Loop Habit Tracker",
  "habits.options.importFile": "导入 UHabits 文件",

  // Create/edit form (HabitView)
  "habits.form.namePlaceholder": "习惯名称",
  "habits.form.nameLabel": "习惯名称",
  "habits.form.detailsPlaceholder": "添加详情（可选）",
  "habits.form.detailsLabel": "习惯详情",
  "habits.form.iconLabel": "图标",
  "habits.form.iconGroup": "习惯图标选择",
  "habits.form.colorLabel": "习惯颜色",
  "habits.form.startDate": "开始日期",
  "habits.form.deleteHabit": "删除习惯",
  "habits.form.startHabit": "开始习惯",
  "habits.form.creatingHabit": "创建中",
  "habits.form.saving": "保存中",
  "habits.form.saveChanges": "保存更改",

  // Sheet sr-only headers
  "habits.sheet.editTitle": "编辑习惯",
  "habits.sheet.newTitle": "新建习惯",
  "habits.sheet.editDescription": "更新习惯详情与追踪频率。",
  "habits.sheet.newDescription": "创建一个新习惯，开始追踪每日进展。",

  // Delete confirmation (quotes the habit name)
  "habits.delete.title": "删除习惯",
  "habits.delete.description": (params: TranslationParams): string =>
    `确定要删除「${params.name}」吗？这也会删除所有完成记录。`,

  // Frequency field ("N times per Day/Week")
  "habits.frequency.fewer": "减少次数",
  "habits.frequency.more": "增加次数",
  "habits.frequency.timePer": (_params: TranslationParams): string => "次 /",
  "habits.frequency.day": "天",
  "habits.frequency.week": "周",
  "habits.frequency.month": "月",
  // sr-only ring description, e.g. "本周 2 / 3"
  "habits.frequency.progressLabel": (params: TranslationParams): string =>
    `${params.window} ${params.completed} / ${params.target}`,
  "habits.frequency.today": "今天",
  "habits.frequency.thisWeek": "本周",
  "habits.frequency.thisMonth": "本月",

  // Cards & rows
  "habits.card.viewInsights": "查看洞察",
  "habits.card.markIncomplete": "标记为未完成",
  "habits.card.markComplete": "标记为完成",
  "habits.card.streakSuffix": "连续",
  "habits.card.totalSuffix": "累计",

  // Insights panel
  "habits.insights.emptyTitle": "暂无数据",
  "habits.insights.emptyDescription": "打卡这个习惯后即可看到洞察。",
  "habits.insights.score": "得分",
  "habits.insights.history": "历史",
  "habits.insights.exportHistory": "导出历史",
  "habits.insights.bestStreaks": "最长连续",
  "habits.insights.frequency": "频率",
  "habits.insights.exportedToast": "习惯历史已导出为 CSV",
  "habits.insights.exportFailed": "习惯历史导出失败",

  // Overview cards
  "habits.overview.score": "得分",
  "habits.overview.currentStreak": "当前连续",
  "habits.overview.bestStreak": "最长连续",
  "habits.overview.totalCompletions": "总完成次数",
  "habits.overview.daysUnit": (params: TranslationParams): string =>
    `${params.count} 天`,

  // Score chart
  "habits.scoreChart.emptyTitle": "暂无得分数据",
  "habits.scoreChart.emptyDescription": "打卡这个习惯后即可看到得分趋势。",
  "habits.scoreChart.week": "周",
  "habits.scoreChart.month": "月",
  "habits.scoreChart.year": "年",

  // Frequency grid
  "habits.frequencyGrid.emptyTitle": "暂无频率数据",
  "habits.frequencyGrid.emptyDescription": "打卡这个习惯后即可看到频率规律。",

  // Best streaks card
  "habits.bestStreaks.emptyTitle": "还没有连续记录",
  "habits.bestStreaks.emptyDescription": "建立连续打卡后即可在这里看到。",

  // Heatmap (react-activity-calendar labels; {{count}} is its own syntax)
  "habits.heatmap.totalCount": "{{year}} 年完成 {{count}} 次",
  "habits.heatmap.less": "少",
  "habits.heatmap.more": "多",

  // Rolling strip cell (aria)
  "habits.stripCell.completed": "已完成",
  "habits.stripCell.notCompleted": "未完成",
  "habits.stripCell.toggleSuffix": "— 点击切换",

  // UHabits (Loop Habit Tracker) import flow
  "habits.import.parsing": (params: TranslationParams): string =>
    `正在解析 ${params.file}…`,
  "habits.import.noCompatible": "数据库中没有找到兼容的习惯",
  "habits.import.allExist": (params: TranslationParams): string =>
    `全部 ${params.count} 个习惯都已存在——未导入任何内容`,
  "habits.import.importing": (params: TranslationParams): string =>
    `正在导入 ${params.count} 个习惯…`,
  "habits.import.importingEntries": (params: TranslationParams): string =>
    `正在导入 ${params.habits} 个习惯和 ${params.entries} 条历史记录…`,
  "habits.import.skippedSuffix": (params: TranslationParams): string =>
    `（已跳过 ${params.count} 个已存在的习惯）`,
  "habits.import.success": (params: TranslationParams): string =>
    `已导入 ${params.habits} 个习惯和 ${params.entries} 条历史记录${params.skipped}`,
  "habits.import.wasmError":
    "无法加载 SQLite 引擎。这是浏览器或网络配置问题，不是 .db 文件的问题。请刷新页面后重试。",
  "habits.import.schemaError":
    "导入 Loop Habit Tracker 数据失败。请确认这是有效的 .db 文件。",
  "habits.import.saveError": "文件读取成功，但保存导入数据失败。请重试。",

  // Icon names (display labels; the stored value stays the English name)
  "habits.icons.Flame": "火焰",
  "habits.icons.Heart": "爱心",
  "habits.icons.Dumbbell": "哑铃",
  "habits.icons.Book": "书本",
  "habits.icons.Coffee": "咖啡",
  "habits.icons.Moon": "月亮",
  "habits.icons.Droplet": "水滴",
  "habits.icons.Smile": "微笑",
  "habits.icons.Pencil": "铅笔",
  "habits.icons.Music": "音乐",
  "habits.icons.Code": "代码",
  "habits.icons.Leaf": "叶子",
  "habits.icons.Bike": "骑行",
  "habits.icons.Brain": "大脑",
  "habits.icons.Camera": "相机",
  "habits.icons.Cooking": "烹饪",
  "habits.icons.Gamepad": "游戏",
  "habits.icons.Graduation": "学业",
  "habits.icons.Finances": "理财",
  "habits.icons.Language": "语言",
  "habits.icons.Medal": "奖牌",
  "habits.icons.Monitor": "屏幕",
  "habits.icons.Pizza": "披萨",
  "habits.icons.Plane": "旅行",
  "habits.icons.Rocket": "火箭",
  "habits.icons.Sun": "太阳",
  "habits.icons.Target": "目标",
  "habits.icons.Trees": "树木",
  "habits.icons.User": "自己",
  "habits.icons.Zap": "闪电",
} satisfies Record<string, DictionaryValue>;
