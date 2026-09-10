import type { DictionaryValue, TranslationParams } from "../../types";

/**
 * English `tasks` module. Seeded by ticket 03 with the Logbook group
 * headers; ticket 05 extracts the rest of the tasks surfaces.
 */
export const tasks = {
  "tasks.logbook.today": "Today",
  "tasks.logbook.yesterday": "Yesterday",
  "tasks.logbook.thisWeek": "This Week",
  "tasks.logbook.older": "Older",

  // Logbook (CompletedTasksSheet)
  "tasks.logbook.title": "Logbook",
  "tasks.logbook.description": "View and manage your completed task history.",
  "tasks.logbook.markIncomplete": "Mark task incomplete",
  "tasks.logbook.emptyTitle": "No Completed Tasks",
  "tasks.logbook.emptyDescription":
    "Tasks you complete will appear here. Start checking off items from your task list!",
  "tasks.logbook.noResultsTitle": "No tasks found",
  "tasks.logbook.noResultsDescription": "Try searching for something else",
  "tasks.logbook.clearHistory": "Clear History",
  "tasks.logbook.clearConfirmTitle": "Clear History",
  "tasks.logbook.clearConfirmDescription":
    "Are you sure you want to delete all completed tasks? This action cannot be undone and will remove these tasks from your statistics.",
  "tasks.logbook.searchPlaceholder": "Search completed tasks...",
  "tasks.logbook.searchLabel": "Search completed tasks",
  "tasks.logbook.close": "Close",

  // Page header (view tabs, filter menu)
  "tasks.header.listViewTitle": "List View (Shift+1)",
  "tasks.header.listView": "List",
  "tasks.header.boardViewTitle": "Board View (Shift+2)",
  "tasks.header.boardView": "Board",
  "tasks.header.filterOptions": "Filter and sort options",
  "tasks.header.sortBy": "Sort By",
  "tasks.header.groupBy": "Group By",
  "tasks.header.clearSort": "Clear sort",
  "tasks.header.clearGrouping": "Clear grouping",
  "tasks.header.completed": "Completed",
  "tasks.view.boardAria": "Task board",
  "tasks.view.listAria": "Task list",

  "tasks.header.newTask": "New Task",

  // Sort/group menu options (lib/types/sorting.ts labels)
  "tasks.sort.date": "Due Date",
  "tasks.sort.priority": "Priority",
  "tasks.sort.alphabetical": "Alphabetical",
  "tasks.sort.custom": "Custom",
  "tasks.group.none": "None",
  "tasks.group.priority": "Priority",
  "tasks.group.date": "Due Date",
  "tasks.group.project": "Project",

  // Create/edit dialog (TaskView + TaskSheet)
  "tasks.form.contentPlaceholder": "What needs to be done?",
  "tasks.form.contentLabel": "Task content",
  "tasks.form.startDate": "Start Date",
  "tasks.form.dueDate": "Due Date",
  "tasks.form.clearDate": (params: TranslationParams) =>
    `Clear ${params.field}`,
  "tasks.form.setDate": (params: TranslationParams) => `Set ${params.field}`,
  "tasks.form.subtasks": "Subtasks",
  "tasks.form.stepCount": (params: TranslationParams): string =>
    params.count === 1 ? "step" : "steps",
  "tasks.form.inbox": "Inbox",
  "tasks.form.deleteTask": "Delete task",
  "tasks.form.createTask": "Create task",
  "tasks.form.saveChanges": "Save changes",
  "tasks.validation.contentRequired": "Task content is required",

  // Task sheet sr-only headers
  "tasks.sheet.editTitle": "Edit Task",
  "tasks.sheet.newTitle": "New Task",
  "tasks.sheet.editDescription": "Update existing task details",
  "tasks.sheet.newDescription": "Create a new task with content and metadata",

  // Delete confirmation (per-task, quotes the task content)
  "tasks.delete.title": "Delete Task",
  "tasks.delete.description": (params: TranslationParams) =>
    `Are you sure you want to delete "${params.content}"? This action cannot be undone.`,

  // Priority
  "tasks.priority.setPriority": "Set priority",
  "tasks.priority.urgent": "Urgent",
  "tasks.priority.high": "High",
  "tasks.priority.normal": "Normal",
  "tasks.priority.low": "Low",

  // Priority group headers (useTaskViewData)
  "tasks.priorityGroup.critical": "Critical",
  "tasks.priorityGroup.high": "High",
  "tasks.priorityGroup.medium": "Medium",
  "tasks.priorityGroup.low": "Low",

  // Date group headers (useTaskViewData)
  "tasks.dateGroup.overdue": "Overdue",
  "tasks.dateGroup.today": "Today",
  "tasks.dateGroup.tomorrow": "Tomorrow",
  "tasks.dateGroup.upcoming": "Upcoming",
  "tasks.dateGroup.noDate": "No Date",

  // Board columns & sections
  "tasks.group.tasks": "Tasks",
  "tasks.group.evening": "This Evening",
  "tasks.group.completedSection": "Completed",
  "tasks.board.dropForEvening": "Drop here for evening",
  "tasks.board.void": "Ma (Void)",

  // Task cards (list row / board card / drag ghost)
  "tasks.card.evening": "Evening",
  "tasks.card.startFocus": "Start focus timer",
  "tasks.card.collapseTask": "Collapse task",
  "tasks.card.expandTask": "Expand task",
  "tasks.card.deleteTask": "Delete task",

  // Empty states
  "tasks.empty.title": "No tasks yet",
  "tasks.empty.description":
    "Focus on what matters. Create your first task to start your journey.",
  "tasks.empty.action": "Create Task",
  "tasks.insights.emptyTitle": "No data yet",
  "tasks.insights.emptyDescription":
    "Complete this task a few times to see insights.",
  "tasks.insights.history": "History",
  "tasks.insights.completionRate": "Completion Rate",
  "tasks.insights.onTime": "On-Time",
  "tasks.insights.currentStreak": "Current Streak",
  "tasks.insights.bestStreak": "Best Streak",
  "tasks.insights.totalCompletions": "Total Completions",

  // Detail panel (split view)
  "tasks.detail.selectTask": "Select a task to view details",
  "tasks.detail.close": "Close task details",

  // Subtasks
  "tasks.subtask.markComplete": (params: TranslationParams) =>
    `Mark "${params.content}" complete`,
  "tasks.subtask.editStep": "Edit step",
  "tasks.subtask.deleteStep": "Delete step",
  "tasks.subtask.addStep": "Add step",
  "tasks.subtask.addStepLabel": "Add a step",
  "tasks.subtask.addStepPlaceholder": "Add a step...",
  "tasks.subtask.stepLabel": (params: TranslationParams) =>
    `Step "${params.content}"`,

  // Notes editor
  "tasks.notes.title": "Notes",
  "tasks.notes.edit": "Edit",
  "tasks.notes.preview": "Preview",
  "tasks.notes.toolbarBold": "Bold",
  "tasks.notes.toolbarItalic": "Italic",
  "tasks.notes.toolbarList": "List",
  "tasks.notes.toolbarLink": "Link",
  "tasks.notes.placeholder": "Add details... (Markdown supported)",
  "tasks.notes.noDescription": "_No description provided._",

  // Recurrence
  "tasks.recurrence.doesNotRepeat": "Does not repeat",
  "tasks.recurrence.daily": "Daily",
  "tasks.recurrence.weekly": "Weekly",
  "tasks.recurrence.monthly": "Monthly",
  "tasks.recurrence.yearly": "Yearly",
  "tasks.recurrence.everyInterval": (params: TranslationParams) =>
    `Every ${params.interval} ${params.unit}${params.interval === 1 ? "" : "s"}`,
  "tasks.recurrence.unitDay": "day",
  "tasks.recurrence.unitWeek": "week",
  "tasks.recurrence.unitMonth": "month",
  "tasks.recurrence.unitYear": "year",
  "tasks.recurrence.type": "Type",
  "tasks.recurrence.strict": "Strict",
  "tasks.recurrence.flexible": "Flexible",
  "tasks.recurrence.strictHint": "Repeats from original due date.",
  "tasks.recurrence.flexibleHint": "Repeats from completion date.",

  // Command layer toasts (lib/commands/task.ts)
  "tasks.toast.restored": "Task restored",
  "tasks.toast.restoreFailed": "Failed to restore task",
  "tasks.toast.deleted": "Task deleted",
  "tasks.toast.duplicated": "Task duplicated",
  "tasks.undo": "Undo",

  // Misc
  "tasks.toast.yankedMissing": "Yanked task no longer exists",
  "tasks.toast.yanked": "Task yanked",
} satisfies Record<string, DictionaryValue>;
