import type { DictionaryValue } from "../../types";

/**
 * English `command` module — the command palette (ticket 04). Keys follow
 * the dot-hierarchical convention; group headings and item labels.
 */
export const command = {
  "command.title": "Command Menu",
  "command.subtitle": "Quick Actions & Navigation",
  "command.searchPlaceholder": "Type a command or search...",
  "command.emptyTitle": "No results found",
  "command.emptyDescription": "Try a different search term.",

  "command.groupActions": "Actions",
  "command.groupTasks": "Tasks",
  "command.groupHabits": "Habits",
  "command.groupEvents": "Events",
  "command.groupFocus": "Focus Sessions",
  "command.groupView": "View Options",
  "command.groupNavigation": "Navigation",
  "command.groupAccount": "Account",

  "command.newTask": "New Task",
  "command.newHabit": "New Habit",
  "command.newEvent": "New Event",
  "command.newProject": "New Project",
  "command.newWorkspace": "New Workspace",
  "command.archivedProjects": "Archived Projects",
  "command.showCompleted": "Show Completed Tasks",
  "command.syncNow": "Sync Now",
  "command.syncing": "Syncing...",
  "command.openPip": "Open PiP Window",
  "command.closePip": "Close PiP Window",
  "command.toggleSidebar": "Toggle Sidebar",
  "command.pomodoro": "Pomodoro (25m)",
  "command.deepWork": "Deep Work (50m)",
  "command.focusSession": "Focus Session",
  "command.sortByDate": "Sort by Date",
  "command.sortByPriority": "Sort by Priority",
  "command.groupByProject": "Group by Project",
  "command.ungroupTasks": "Ungroup Tasks",
  "command.toggleDarkMode": "Toggle Dark Mode",
  "command.keyboardShortcuts": "Keyboard Shortcuts",
  "command.copyUserId": "Copy My User ID",
  "command.signOut": "Sign Out",
} satisfies Record<string, DictionaryValue>;
