import type { DictionaryValue, TranslationParams } from "../../types";

/**
 * zh-CN `tasks` module — mirrors `dictionaries/en/tasks.ts` exactly
 * (enforced by the `Dictionary` type at the locale index). Glossary:
 * Task → 任务, Streak → 连续 (per CONTEXT.md, Stats/Insights → 统计/洞察).
 */
export const tasks = {
  "tasks.logbook.today": "今天",
  "tasks.logbook.yesterday": "昨天",
  "tasks.logbook.thisWeek": "本周",
  "tasks.logbook.older": "更早",

  // Logbook (CompletedTasksSheet)
  "tasks.logbook.title": "日志",
  "tasks.logbook.description": "查看并管理你已完成的任务历史。",
  "tasks.logbook.markIncomplete": "将任务标记为未完成",
  "tasks.logbook.emptyTitle": "暂无已完成任务",
  "tasks.logbook.emptyDescription":
    "完成的任务会显示在这里。去任务列表勾选条目吧！",
  "tasks.logbook.noResultsTitle": "未找到任务",
  "tasks.logbook.noResultsDescription": "换个关键词试试",
  "tasks.logbook.clearHistory": "清除历史",
  "tasks.logbook.clearConfirmTitle": "清除历史",
  "tasks.logbook.clearConfirmDescription":
    "确定要删除所有已完成的任务吗？此操作无法撤销，且这些任务将从统计中移除。",
  "tasks.logbook.searchPlaceholder": "搜索已完成的任务…",
  "tasks.logbook.searchLabel": "搜索已完成的任务",
  "tasks.logbook.close": "关闭",

  // Page header (view tabs, filter menu)
  "tasks.header.listViewTitle": "列表视图 (Shift+1)",
  "tasks.header.listView": "列表",
  "tasks.header.boardViewTitle": "看板视图 (Shift+2)",
  "tasks.header.boardView": "看板",
  "tasks.header.filterOptions": "筛选与排序选项",
  "tasks.header.sortBy": "排序方式",
  "tasks.header.groupBy": "分组方式",
  "tasks.header.clearSort": "清除排序",
  "tasks.header.clearGrouping": "清除分组",
  "tasks.header.completed": "已完成",
  "tasks.view.boardAria": "任务看板",
  "tasks.view.listAria": "任务列表",

  "tasks.header.newTask": "新建任务",

  // Sort/group menu options (lib/types/sorting.ts labels)
  "tasks.sort.date": "截止日期",
  "tasks.sort.priority": "优先级",
  "tasks.sort.alphabetical": "按字母顺序",
  "tasks.sort.custom": "自定义",
  "tasks.group.none": "无",
  "tasks.group.priority": "优先级",
  "tasks.group.date": "截止日期",
  "tasks.group.project": "项目",

  // Create/edit dialog (TaskView + TaskSheet)
  "tasks.form.contentPlaceholder": "要做什么？",
  "tasks.form.contentLabel": "任务内容",
  "tasks.form.startDate": "开始日期",
  "tasks.form.dueDate": "截止日期",
  "tasks.form.clearDate": (params: TranslationParams) => `清除${params.field}`,
  "tasks.form.setDate": (params: TranslationParams) => `设置${params.field}`,
  "tasks.form.subtasks": "子任务",
  "tasks.form.stepCount": (_params: TranslationParams): string => "步",
  "tasks.form.inbox": "收件箱",
  "tasks.form.deleteTask": "删除任务",
  "tasks.form.createTask": "创建任务",
  "tasks.form.saveChanges": "保存更改",
  "tasks.validation.contentRequired": "请输入任务内容",

  // Task sheet sr-only headers
  "tasks.sheet.editTitle": "编辑任务",
  "tasks.sheet.newTitle": "新建任务",
  "tasks.sheet.editDescription": "更新现有任务详情",
  "tasks.sheet.newDescription": "创建带内容和元数据的新任务",

  // Delete confirmation (per-task, quotes the task content)
  "tasks.delete.title": "删除任务",
  "tasks.delete.description": (params: TranslationParams) =>
    `确定要删除「${params.content}」吗？此操作无法撤销。`,

  // Priority
  "tasks.priority.setPriority": "设置优先级",
  "tasks.priority.urgent": "紧急",
  "tasks.priority.high": "高",
  "tasks.priority.normal": "普通",
  "tasks.priority.low": "低",

  // Priority group headers (useTaskViewData)
  "tasks.priorityGroup.critical": "紧急",
  "tasks.priorityGroup.high": "高",
  "tasks.priorityGroup.medium": "中",
  "tasks.priorityGroup.low": "低",

  // Date group headers (useTaskViewData)
  "tasks.dateGroup.overdue": "已逾期",
  "tasks.dateGroup.today": "今天",
  "tasks.dateGroup.tomorrow": "明天",
  "tasks.dateGroup.upcoming": "即将到来",
  "tasks.dateGroup.noDate": "无日期",

  // Board columns & sections
  "tasks.group.tasks": "任务",
  "tasks.group.evening": "今晚",
  "tasks.group.completedSection": "已完成",
  "tasks.board.dropForEvening": "拖到这里设为今晚",
  "tasks.board.void": "间 (空)",

  // Task cards (list row / board card / drag ghost)
  "tasks.card.evening": "今晚",
  "tasks.card.startFocus": "开始专注计时",
  "tasks.card.collapseTask": "收起任务",
  "tasks.card.expandTask": "展开任务",
  "tasks.card.deleteTask": "删除任务",

  // Empty states
  "tasks.empty.title": "还没有任务",
  "tasks.empty.description": "专注于重要的事。创建第一个任务，开启你的旅程。",
  "tasks.empty.action": "创建任务",
  "tasks.insights.emptyTitle": "暂无数据",
  "tasks.insights.emptyDescription": "多完成几次这个任务，就能看到洞察数据。",
  "tasks.insights.history": "历史",
  "tasks.insights.completionRate": "完成率",
  "tasks.insights.onTime": "按时完成",
  "tasks.insights.currentStreak": "当前连续",
  "tasks.insights.bestStreak": "最长连续",
  "tasks.insights.totalCompletions": "总完成次数",

  // Detail panel (split view)
  "tasks.detail.selectTask": "选择一个任务以查看详情",
  "tasks.detail.close": "关闭任务详情",

  // Subtasks
  "tasks.subtask.markComplete": (params: TranslationParams) =>
    `将「${params.content}」标记为完成`,
  "tasks.subtask.editStep": "编辑步骤",
  "tasks.subtask.deleteStep": "删除步骤",
  "tasks.subtask.addStep": "添加步骤",
  "tasks.subtask.addStepLabel": "添加一个步骤",
  "tasks.subtask.addStepPlaceholder": "添加一个步骤…",
  "tasks.subtask.stepLabel": (params: TranslationParams) =>
    `步骤「${params.content}」`,

  // Notes editor
  "tasks.notes.title": "备注",
  "tasks.notes.edit": "编辑",
  "tasks.notes.preview": "预览",
  "tasks.notes.toolbarBold": "粗体",
  "tasks.notes.toolbarItalic": "斜体",
  "tasks.notes.toolbarList": "列表",
  "tasks.notes.toolbarLink": "链接",
  "tasks.notes.placeholder": "添加详情…（支持 Markdown）",
  "tasks.notes.noDescription": "_暂无描述。_",

  // Recurrence
  "tasks.recurrence.doesNotRepeat": "不重复",
  "tasks.recurrence.daily": "每天",
  "tasks.recurrence.weekly": "每周",
  "tasks.recurrence.monthly": "每月",
  "tasks.recurrence.yearly": "每年",
  "tasks.recurrence.everyInterval": (params: TranslationParams) =>
    `每 ${params.interval} ${params.unit}`,
  "tasks.recurrence.unitDay": "天",
  "tasks.recurrence.unitWeek": "周",
  "tasks.recurrence.unitMonth": "月",
  "tasks.recurrence.unitYear": "年",
  "tasks.recurrence.type": "类型",
  "tasks.recurrence.strict": "严格",
  "tasks.recurrence.flexible": "灵活",
  "tasks.recurrence.strictHint": "从原截止日期开始重复。",
  "tasks.recurrence.flexibleHint": "从完成日期开始重复。",

  // Command layer toasts (lib/commands/task.ts)
  "tasks.toast.restored": "任务已恢复",
  "tasks.toast.restoreFailed": "任务恢复失败",
  "tasks.toast.deleted": "任务已删除",
  "tasks.toast.duplicated": "任务已复制",
  "tasks.undo": "撤销",

  // Misc
  "tasks.toast.yankedMissing": "复制的任务已不存在",
  "tasks.toast.yanked": "任务已剪切",
} satisfies Record<string, DictionaryValue>;
