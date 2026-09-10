import type { DictionaryValue, TranslationParams } from "../../types";

/**
 * English `habits` module (ticket 06). Domain vocabulary is load-bearing
 * (CONTEXT.md): Habit → 习惯, Entry → 记录, Streak → 连续 (day-counting),
 * Score → 得分 (strength), Goal → 目标, Frequency → 频率,
 * Series/Occurrence → 系列/出现次数.
 */
export const habits = {
  // Page header & view toggle
  "habits.header.newHabit": "New Habit",
  "habits.view.grid": "Grid",
  "habits.view.compact": "Compact",

  // Habits page (app/habits)
  "habits.page.title": "Habits",
  "habits.page.loadError": "Failed to load habits",
  "habits.page.emptyTitle": "No habits yet",
  "habits.page.emptyDescription":
    "Small changes lead to big results. Create your first habit to start tracking.",
  "habits.page.createHabit": "Create Habit",

  // Options menu (import)
  "habits.options.srLabel": "Habit options",
  "habits.options.data": "Habit Data",
  "habits.options.loop": "Loop Habit Tracker",
  "habits.options.importFile": "Import UHabits file",

  // Create/edit form (HabitView)
  "habits.form.namePlaceholder": "Habit name",
  "habits.form.nameLabel": "Habit name",
  "habits.form.detailsPlaceholder": "Add details (optional)",
  "habits.form.detailsLabel": "Habit details",
  "habits.form.iconLabel": "Icon",
  "habits.form.iconGroup": "Habit icon selection",
  "habits.form.colorLabel": "Habit color",
  "habits.form.startDate": "Start Date",
  "habits.form.deleteHabit": "Delete habit",
  "habits.form.startHabit": "Start habit",
  "habits.form.creatingHabit": "Creating habit",
  "habits.form.saving": "Saving",
  "habits.form.saveChanges": "Save changes",

  // Sheet sr-only headers
  "habits.sheet.editTitle": "Edit Habit",
  "habits.sheet.newTitle": "New Habit",
  "habits.sheet.editDescription":
    "Update your habit details and tracking frequency.",
  "habits.sheet.newDescription":
    "Create a new habit to start tracking your daily progress.",

  // Delete confirmation (quotes the habit name)
  "habits.delete.title": "Delete Habit",
  "habits.delete.description": (params: TranslationParams): string =>
    `Are you sure you want to delete "${params.name}"? This will also delete all completion history.`,

  // Frequency field ("N times per Day/Week")
  "habits.frequency.fewer": "Fewer times",
  "habits.frequency.more": "More times",
  "habits.frequency.timePer": (params: TranslationParams): string =>
    params.count === 1 ? "time per" : "times per",
  "habits.frequency.day": "Day",
  "habits.frequency.week": "Week",
  "habits.frequency.month": "Month",
  // sr-only ring description, e.g. "2 of 3 this week"
  "habits.frequency.progressLabel": (params: TranslationParams): string =>
    `${params.completed} of ${params.target} ${params.window}`,
  "habits.frequency.today": "today",
  "habits.frequency.thisWeek": "this week",
  "habits.frequency.thisMonth": "this month",

  // Cards & rows
  "habits.card.viewInsights": "View insights",
  "habits.card.markIncomplete": "Mark incomplete",
  "habits.card.markComplete": "Mark complete",
  "habits.card.streakSuffix": "streak",
  "habits.card.totalSuffix": "total",

  // Insights panel
  "habits.insights.emptyTitle": "No data yet",
  "habits.insights.emptyDescription": "Log this habit to see insights.",
  "habits.insights.score": "Score",
  "habits.insights.history": "History",
  "habits.insights.exportHistory": "Export history",
  "habits.insights.bestStreaks": "Best Streaks",
  "habits.insights.frequency": "Frequency",
  "habits.insights.exportedToast": "Habit history exported as CSV",
  "habits.insights.exportFailed": "Failed to export habit history",

  // Overview cards
  "habits.overview.score": "Score",
  "habits.overview.currentStreak": "Current Streak",
  "habits.overview.bestStreak": "Best Streak",
  "habits.overview.totalCompletions": "Total Completions",
  "habits.overview.daysUnit": (params: TranslationParams): string =>
    `${params.count} days`,

  // Score chart
  "habits.scoreChart.emptyTitle": "No score data",
  "habits.scoreChart.emptyDescription":
    "Log this habit to see your score trend.",
  "habits.scoreChart.week": "Week",
  "habits.scoreChart.month": "Month",
  "habits.scoreChart.year": "Year",

  // Frequency grid
  "habits.frequencyGrid.emptyTitle": "No frequency data",
  "habits.frequencyGrid.emptyDescription":
    "Log this habit to see frequency patterns.",

  // Best streaks card
  "habits.bestStreaks.emptyTitle": "No streaks yet",
  "habits.bestStreaks.emptyDescription": "Build a streak to see it here.",

  // Heatmap (react-activity-calendar labels; {{count}} is its own syntax)
  "habits.heatmap.totalCount": "{{count}} completions in {{year}}",
  "habits.heatmap.less": "Less",
  "habits.heatmap.more": "More",

  // Rolling strip cell (aria)
  "habits.stripCell.completed": "completed",
  "habits.stripCell.notCompleted": "not completed",
  "habits.stripCell.toggleSuffix": "— toggle",

  // UHabits (Loop Habit Tracker) import flow
  "habits.import.parsing": (params: TranslationParams): string =>
    `Parsing ${params.file}...`,
  "habits.import.noCompatible": "No compatible habits found in the database",
  "habits.import.allExist": (params: TranslationParams): string =>
    `All ${params.count} habits already exist — nothing imported`,
  "habits.import.importing": (params: TranslationParams): string =>
    `Importing ${params.count} habits...`,
  "habits.import.importingEntries": (params: TranslationParams): string =>
    `Importing ${params.habits} habits and ${params.entries} history entries...`,
  "habits.import.skippedSuffix": (params: TranslationParams): string =>
    ` (${params.count} already existed, skipped)`,
  "habits.import.success": (params: TranslationParams): string =>
    `Imported ${params.habits} habits with ${params.entries} history entries${params.skipped}`,
  "habits.import.wasmError":
    "Failed to load the SQLite engine. This is a browser or network configuration issue, not a problem with your .db file. Refresh the page and try again.",
  "habits.import.schemaError":
    "Failed to import Loop Habit Tracker data. Ensure it is a valid .db file.",
  "habits.import.saveError":
    "Your file was read correctly, but saving the imported data failed. Please try again.",

  // Icon names (display labels; the stored value stays the English name)
  "habits.icons.Flame": "Flame",
  "habits.icons.Heart": "Heart",
  "habits.icons.Dumbbell": "Dumbbell",
  "habits.icons.Book": "Book",
  "habits.icons.Coffee": "Coffee",
  "habits.icons.Moon": "Moon",
  "habits.icons.Droplet": "Droplet",
  "habits.icons.Smile": "Smile",
  "habits.icons.Pencil": "Pencil",
  "habits.icons.Music": "Music",
  "habits.icons.Code": "Code",
  "habits.icons.Leaf": "Leaf",
  "habits.icons.Bike": "Bike",
  "habits.icons.Brain": "Brain",
  "habits.icons.Camera": "Camera",
  "habits.icons.Cooking": "Cooking",
  "habits.icons.Gamepad": "Gamepad",
  "habits.icons.Graduation": "Graduation",
  "habits.icons.Finances": "Finances",
  "habits.icons.Language": "Language",
  "habits.icons.Medal": "Medal",
  "habits.icons.Monitor": "Monitor",
  "habits.icons.Pizza": "Pizza",
  "habits.icons.Plane": "Plane",
  "habits.icons.Rocket": "Rocket",
  "habits.icons.Sun": "Sun",
  "habits.icons.Target": "Target",
  "habits.icons.Trees": "Trees",
  "habits.icons.User": "User",
  "habits.icons.Zap": "Zap",
} satisfies Record<string, DictionaryValue>;
