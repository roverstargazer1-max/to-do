import type { DictionaryValue, TranslationParams } from "../../types";

/**
 * English `common` module — cross-surface strings shared by the app shell
 * (ticket 04): navigation, sidebar, header, generic dialogs, loading.
 * Extraction convention: dot-hierarchical keys namespaced by module;
 * count-dependent strings as functions (D-07).
 */
export const common = {
  "common.ok": "OK",
  "common.cancel": "Cancel",
  // Kagelin is never translated (spec terminology) — same value per locale.
  "common.appTitle": "Kagelin",
  // English pluralization is why dictionary values may be functions (D-07).
  "common.itemCount": (params: TranslationParams) =>
    params.count === 1 ? "1 item" : `${params.count} items`,
  "common.loading": "Loading...",
  "common.search": "Search",

  // Navigation (sidebar, mobile nav, command palette)
  "common.nav.allTasks": "All Tasks",
  "common.nav.habits": "Habits",
  "common.nav.calendar": "Calendar",
  "common.nav.stats": "Stats",
  "common.nav.statistics": "Statistics",
  "common.nav.focus": "Focus",
  "common.nav.settings": "Settings",
  "common.nav.home": "Home",
  "common.nav.workspaces": "Workspaces",

  // Sidebar
  "common.sidebar.projects": "Projects",
  "common.sidebar.addProject": "Add Project",
  "common.sidebar.inbox": "Inbox",
  "common.sidebar.editProject": "Edit Project",
  "common.sidebar.deleteProject": "Delete Project",
  "common.sidebar.archivedProjects": "Archived Projects",
  "common.sidebar.addWorkspace": "Add Workspace",
  "common.sidebar.renameWorkspace": "Rename Workspace",
  "common.sidebar.deleteWorkspace": "Delete Workspace",
  "common.sidebar.more": "More",
  "common.sidebar.whatsNew": "What's New",
  "common.sidebar.build": "Build",
  "common.sidebar.preview": "Preview",
  "common.sidebar.actionPrompt": "What would you like to do?",
  "common.sidebar.toggle": "Toggle Sidebar",
  "common.sidebar.title": "Sidebar",
  "common.sidebar.mobileDescription": "Displays the mobile sidebar.",

  // Header (mobile)
  "common.header.moreOptions": "More options",
  "common.header.whatsNewAria": "What's New — new version available",
  "common.header.completedTasks": "Completed Tasks",

  // Generic confirmation dialogs
  "common.dialog.deleteTitle": "Delete Task",
  "common.dialog.deleteDescription":
    "Are you sure you want to delete this task? This action cannot be undone.",
  "common.dialog.delete": "Delete",
  "common.dialog.signOutTitle": "Sign Out",
  "common.dialog.signOutDescription":
    "Are you sure you want to sign out? You will need to log in again to access your tasks.",
  "common.dialog.signOutConfirm": "Sign Out",
  "common.dialog.deleteProjectDescription": (params: TranslationParams) =>
    `Are you sure you want to delete "${params.name}"? Choose what happens to its tasks.`,
  "common.dialog.deleteAllTasks": "Delete All Tasks",
  "common.dialog.moveToInbox": "Move to Inbox",
  "common.dialog.keepArchived": "Keep Archived",

  // Project create/edit dialogs (CreateProjectDialog / EditProjectDialog)
  "common.project.createTitle": "Create Project",
  "common.project.createDescription": "Organize your tasks into a new project.",
  "common.project.editDescription": "Update project name and color.",
  "common.project.nameLabel": "Project Name",
  "common.project.namePlaceholder": "Work, Personal, School…",
  "common.project.editNamePlaceholder": "Project name…",
  "common.project.colorLabel": "Project color",
  "common.project.nameError": "Project name is required",
  "common.project.editNameLabel": "Project name",
  "common.project.editNameError": "Name is required",
  "common.project.invalidColor": "Invalid color format",
  "common.project.create": "Create project",
  "common.project.creating": "Creating project",
  "common.project.save": "Save project",
  "common.project.saving": "Saving project",

  // Archived projects dialog (projects/ArchivedProjectsDialog.tsx)
  "common.projects.archivedDescription": "View and restore archived projects",
  "common.projects.archivedEmptyTitle": "No archived projects",
  "common.projects.archivedEmptyDescription":
    "Projects you archive will show up here for restoring later.",
  "common.projects.restore": "Restore",

  // Generic shell chrome shared by ui/dialog.tsx and ui/sheet.tsx
  "common.ui.close": "Close",

  // Shared sheet tab toggle (tasks + habits)
  "common.tab.edit": "Edit",
  "common.tab.insights": "Insights",

  // Shared mutation error toasts (lib/utils/mutation-error.ts)
  "common.errors.network": "Network Error. Changes could not be saved.",
  "common.errors.auth": "Authentication error. Please log in again.",
  "common.errors.generic": "An error occurred.",
  "common.errors.unexpected": "An unexpected error occurred.",
  "common.errors.unknown": "Unknown error",

  // Global sync indicator (ui/SyncIndicator.tsx)
  "common.syncing": "Syncing",
  "common.syncingStatus": "Syncing...",

  // Guest-data migration overlay (layout/AppShell.tsx)
  "common.migratingGuestData": "Migrating guest data...",

  // Segmented time picker (ui/segmented-time-picker.tsx)
  "common.timepicker.adjustHours": "Adjust Hours",
  "common.timepicker.adjustMinutes": "Adjust Minutes",
  "common.timepicker.toggleAmpm": "Toggle AM PM",

  // Home page (app/page.tsx → HomeClient)
  "common.home.greetingMorning": "Good morning",
  "common.home.greetingAfternoon": "Good afternoon",
  "common.home.greetingEvening": "Good evening",
  "common.home.highPriority": "High Priority",
  "common.home.clearFilter": "Clear filter",

  // PWA install hint (home/PwaInstallHint.tsx)
  "common.pwa.iosTitle": "Add Kagelin to your Home Screen",
  "common.pwa.iosDescription":
    "Tap Share, then Add to Home Screen. Also required for notifications.",
  "common.pwa.installTitle": "Install Kagelin",
  "common.pwa.installDescription":
    "Works offline and launches straight from your home screen.",

  // Telemetry consent prompt (telemetry/TelemetryConsentPrompt.tsx)
  "common.telemetry.regionLabel": "Telemetry consent",
  "common.telemetry.message":
    "Kagelin is open source & privacy-first. Share anonymous telemetry to help improve the app? See our ",
  "common.telemetry.dismiss": "No thanks",
  "common.telemetry.enable": "Enable",
  "common.telemetry.closeAria": "Dismiss",

  // Access-denied page (app/access-denied/page.tsx)
  "common.accessDenied.title": "Private Access Only",
  "common.accessDenied.description":
    "This app is for personal use only. If you believe you should have access, contact the owner.",
  "common.accessDenied.backToLogin": "Back to Login",

  // Error boundary (app/error.tsx)
  "common.error.title": "Something went wrong",
  "common.error.description":
    "Kagelin hit an unexpected error. Your data is safe — try again, or head back home if it keeps happening.",
  "common.error.goHome": "Go home",
  "common.error.tryAgain": "Try again",

  // Demo-mode banner (DemoBar.tsx)
  "common.demo.message": "You're exploring with demo data",
  "common.demo.startFresh": "Start fresh",

  // Offline banner (OfflineIndicator.tsx)
  "common.offline.title": "You are offline",
  "common.offline.description": "Changes will sync when back online",

  // Root-layout crash boundary (app/global-error.tsx)
  "common.globalError.title": "Kagelin failed to load",
  "common.globalError.description":
    "Something went wrong before the app could start. Try reloading \u2014 your data is safe.",
  "common.globalError.tryAgain": "Try again",

  // Status badges
  "common.badge.preview": "Preview",
  "common.badge.beta": "Beta",

  // Shared color picker (shared/ColorPicker.tsx)
  "common.colorPicker.label": "Color",
  "common.colorPicker.selectAria": "Select color",

  // Date/time wizard (ui/date-time-wizard.tsx)
  "common.dateWizard.date": "Date",
  "common.dateWizard.time": "Time",
  "common.dateWizard.today": "Today",
  "common.dateWizard.tomorrow": "Tomorrow",
  "common.dateWizard.evening": "Evening",
  "common.dateWizard.morning": "Morning",
  "common.dateWizard.afternoon": "Afternoon",
  "common.dateWizard.night": "Night",
  "common.dateWizard.done": "Done",
  "common.dateWizard.setTimeFor": (params: TranslationParams) =>
    `Set Time for ${params.date}`,

  // App-level toasts (hooks/useWeeklyBackup.ts)
  "common.backup.downloaded": "Backup downloaded successfully",
  "common.backup.createFailed": "Failed to create backup",
  "common.backup.reminder":
    "It's been a while since your last backup \u2014 back up now to prevent loss",
  "common.backup.backUpNow": "Back Up Now",

  // App-level toasts (hooks/useAccountData.ts)
  "common.account.loginRequiredExport":
    "You must be logged in to export cloud data",
  "common.account.loginRequiredImport":
    "You must be logged in to import cloud data",
  "common.account.exportPreparing": "Preparing your data export...",
  "common.account.exportSuccess": "Data exported successfully",
  "common.account.exportFailed": (params: TranslationParams) =>
    `Export failed: ${params.message}`,
  "common.account.importing": "Importing your cloud data...",
  "common.account.importSuccess":
    "Data imported successfully. Please refresh to see changes.",
  "common.account.importFailed": (params: TranslationParams) =>
    `Import failed: ${params.message}`,
  "common.account.invalidBackup":
    "Invalid backup file format: missing essential data",
  "common.account.clearing": "Clearing your cloud data...",
  "common.account.clearSuccess": "Cloud data cleared successfully",
  "common.account.clearFailed": (params: TranslationParams) =>
    `Clear failed: ${params.message}`,

  // Picture-in-Picture document title (hooks/useDocumentPiP.ts)
  "common.pip.focusTimer": "Focus Timer",

  // Generated event title fallback (utils/nlp-event.ts)
  "common.untitledEvent": "Untitled Event",
} satisfies Record<string, DictionaryValue>;
