import type { DictionaryValue } from "../../types";

/**
 * English `shortcuts` module — the keyboard shortcuts help dialog
 * (ticket 04). Group titles and shortcut descriptions.
 */
export const shortcuts = {
  "shortcuts.title": "Keyboard Shortcuts",
  "shortcuts.subtitle": "Refine your workflow with Kagelin",

  "shortcuts.groupNavigation": "Navigation",
  "shortcuts.groupActions": "Actions",
  "shortcuts.groupView": "View",
  "shortcuts.groupVim": "Task List (Vim)",

  "shortcuts.goToTasks": "Go to Tasks",
  "shortcuts.goToHabits": "Go to Habits",
  "shortcuts.goToCalendar": "Go to Calendar",
  "shortcuts.goToStats": "Go to Stats",
  "shortcuts.goToFocus": "Go to Focus",
  "shortcuts.goToSettings": "Go to Settings",
  "shortcuts.toggleSidebar": "Toggle Sidebar",
  "shortcuts.closeFocusDialogs": "Close Focus/Dialogs",
  "shortcuts.newTask": "New Task",
  "shortcuts.createHabit": "Create Habit",
  "shortcuts.newEvent": "New Event",
  "shortcuts.newProject": "New Project",
  "shortcuts.newWorkspace": "New Workspace",
  "shortcuts.archivedProjects": "Archived Projects",
  "shortcuts.toggleCompleted": "Toggle Completed Tasks",
  "shortcuts.saveTask": "Save Task",
  "shortcuts.searchCommandMenu": "Search / Command Menu",
  "shortcuts.switchTheme": "Switch Theme",
  "shortcuts.focusMode": "Focus Mode",
  "shortcuts.showShortcuts": "Show Shortcuts",
  "shortcuts.listView": "List View",
  "shortcuts.boardView": "Board View",
  "shortcuts.selectNextTask": "Select Next Task",
  "shortcuts.selectPreviousTask": "Select Previous Task",
  "shortcuts.selectColumnLeft": "Select Column Left (Board)",
  "shortcuts.selectColumnRight": "Select Column Right (Board)",
  "shortcuts.jumpToFirstTask": "Jump to First Task",
  "shortcuts.jumpToLastTask": "Jump to Last Task",
  "shortcuts.openSelected": "Open Selected",
  "shortcuts.toggleCompletion": "Toggle Completion",
  "shortcuts.deleteSelected": "Delete Selected",
  "shortcuts.undo": "Undo",
  "shortcuts.yankSelectedTask": "Yank Selected Task",
  "shortcuts.pasteYankedTask": "Paste Yanked Task",
  "shortcuts.clearSelection": "Clear Selection",
} satisfies Record<string, DictionaryValue>;
