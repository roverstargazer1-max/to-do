import type { DictionaryValue, TranslationParams } from "../../types";

/**
 * English `settings` module. Ticket 02 introduced the Language row and
 * the Preferences section header; ticket 03 added the backup timestamp
 * connector; ticket 08 extracts the rest of the settings surfaces —
 * tabs, Appearance, Goals, Account, Notifications, WebDAV/local backup,
 * import, delete, privacy and PWA.
 */
export const settings = {
  // --- Page chrome (SettingsClient.tsx) ---
  "settings.title": "Settings",
  "settings.subtitle": "Manage your account and preferences",
  "settings.back": "Back",
  "settings.tab.appearance": "Appearance",
  "settings.tab.preferences": "Preferences",
  "settings.tab.account": "Account",
  "settings.signingOut": "Signing out...",
  "settings.about": "About",

  // --- Appearance ---
  "settings.appearance.title": "Appearance",
  "settings.appearance.theme": "Theme",
  "settings.appearance.themeLight": "Light",
  "settings.appearance.themeDark": "Dark",
  "settings.appearance.themeSystem": "System",

  // --- Preferences (Language row keys are from ticket 02) ---
  "settings.preferences.title": "Preferences",
  "settings.language.label": "Language",
  "settings.language.description": "Choose the display language",
  "settings.haptics.label": "Haptic Feedback",
  "settings.haptics.description": "Vibrate on interactions",
  "settings.timeFormat.label": "Time Format",
  "settings.timeFormat.description": "Choose how times are displayed",
  "settings.timeFormat.12h": "12-hour",
  "settings.timeFormat.24h": "24-hour",
  "settings.timeFormat.system": "System",

  // --- Goals ---
  "settings.goals.title": "Goals",
  "settings.goals.label": "Goals",
  "settings.goals.description":
    "Daily and weekly targets shown as rings on the Stats page. Leave a field empty to hide its ring.",
  "settings.goals.dailyFocusHours": "Daily focus hours",
  "settings.goals.weeklyFocusHours": "Weekly focus hours",
  "settings.goals.dailyTasksCompleted": "Daily tasks completed",
  "settings.goals.weeklyTasksCompleted": "Weekly tasks completed",
  "settings.goals.off": "Off",

  // --- Guest mode ---
  "settings.guest.title": "Guest Mode",
  "settings.guest.description":
    "Your data is stored locally in your browser. Sign in to sync your data across devices and ensure it's never lost.",
  "settings.guest.syncToAccount": "Sync to Account",
  "settings.guest.resetDemo": "Reset Demo",
  "settings.guest.clearData": "Clear Data",

  // --- Account ---
  "settings.account.title": "Account",
  "settings.account.name": "Name",
  "settings.account.email": "Email",
  "settings.account.notSignedIn": "Not signed in",
  "settings.account.deleteCloudData": "Delete Cloud Data",
  "settings.account.signOut": "Sign Out",

  // --- Account section (AccountSection.tsx) ---
  "settings.account.providers.title": "Connected Providers",
  "settings.account.providers.description":
    "Manage the providers connected to your account.",
  "settings.account.providers.email": "Email",
  "settings.account.providers.connected": "Connected",
  "settings.account.providers.notConnected": "Not connected",
  "settings.account.providers.connect": "Connect",
  "settings.account.providers.connecting": "Connecting...",
  "settings.account.providers.disconnect": "Disconnect",
  "settings.account.providers.disconnecting": "Disconnecting...",
  "settings.account.providers.connectAria": (params: TranslationParams) =>
    `Connect ${params.provider}`,
  "settings.account.providers.disconnectAria": (params: TranslationParams) =>
    `Disconnect ${params.provider}`,
  "settings.account.providers.disconnectFailed":
    "Failed to disconnect provider",
  "settings.account.providers.disconnected": (params: TranslationParams) =>
    `Disconnected ${params.provider}`,
  "settings.account.password.setTitle": "Set Password",
  "settings.account.password.changeTitle": "Change Password",
  "settings.account.password.setDescription":
    "Set a password to enable email and password sign-in for your account.",
  "settings.account.password.changeDescription":
    "Update your existing account password.",
  "settings.account.password.newPassword": "New Password",
  "settings.account.password.tooShort": (params: TranslationParams) =>
    `Password must be at least ${params.min} characters.`,
  "settings.account.password.verificationCode": "Verification code",
  "settings.account.password.codePlaceholder": "Enter the code from your email",
  "settings.account.password.reauthNotice":
    "For your security, we sent a code to your email to confirm this change.",
  "settings.account.password.resend": "Resend code",
  "settings.account.password.resending": "Resending…",
  "settings.account.password.contactSupport": "Contact support",
  "settings.account.password.set": "Set password",
  "settings.account.password.change": "Change password",
  "settings.account.password.setting": "Setting...",
  "settings.account.password.updating": "Updating...",
  "settings.account.password.confirming": "Confirming...",
  "settings.account.password.confirmChange": "Confirm password change",
  "settings.account.password.setSuccess": "Password set successfully",
  "settings.account.password.changeSuccess": "Password changed successfully",
  "settings.account.password.invalidCode":
    "That code wasn't right. Check your email and try again.",
  "settings.account.password.updateFailed": "Failed to update password",
  "settings.account.password.codeSendFailed":
    "Failed to send verification code",
  "settings.account.password.codeResent": "Verification code resent",

  // --- Notifications (NotificationSettings.tsx) ---
  "settings.notifications.unsupported.title": "Notifications Not Supported",
  "settings.notifications.unsupported.description":
    "Your browser doesn't support push notifications",
  "settings.notifications.ios.title":
    "Add Kagelin to your Home Screen to turn on notifications",
  "settings.notifications.ios.description":
    "Tap Share, then Add to Home Screen.",
  "settings.notifications.push.title": "Push Notifications",
  "settings.notifications.push.guestHint": "Sign in to enable notifications",
  "settings.notifications.push.grantedHint": "Receive updates and reminders",
  "settings.notifications.push.enableHint": "Enable to receive updates",
  "settings.notifications.push.guestTooltip":
    "Available for registered users only",
  "settings.notifications.sendTest": "Send Test Notification (Server)",
  "settings.notifications.triggerLocal":
    "Trigger Local Notification (Sanity Check)",
  "settings.notifications.androidLate":
    "Notifications arriving late on Android?",
  "settings.notifications.localTime.title": "Local Time",
  "settings.notifications.localTime.description":
    "Confirm your timezone to ensure morning briefings and task alerts arrive at the right local time.",
  "settings.notifications.timezone.select": "Select Timezone",
  "settings.notifications.timezone.search": "Search timezone",
  "settings.notifications.timezone.searchPlaceholder": "Search timezone...",
  "settings.notifications.timezone.empty": "No timezone found",
  "settings.notifications.schedules.title": "Schedules",
  "settings.notifications.schedules.morningTitle": "Morning Briefing",
  "settings.notifications.schedules.morningDescription":
    "Daily summary at 8:00 AM",
  "settings.notifications.schedules.eveningTitle": "Evening Plan",
  "settings.notifications.schedules.eveningDescription":
    "Review tonight's tasks at 6:00 PM",
  "settings.notifications.schedules.dueTitle": "Due Date Alerts",
  "settings.notifications.schedules.dueDescription":
    "When a task reaches its deadline",
  "settings.notifications.schedules.timerTitle": "Timer Completion",
  "settings.notifications.schedules.timerDescription":
    "When your focus or break ends",
  "settings.notifications.toast.unsupported":
    "Push notifications are not supported in this browser",
  "settings.notifications.toast.enabled": "Notifications enabled",
  "settings.notifications.toast.denied":
    "Permission denied. Enable in browser settings.",
  "settings.notifications.toast.activateFailed":
    "Failed to activate notifications on this device.",
  "settings.notifications.toast.disabled": "Notifications disabled",
  "settings.notifications.toast.updateFailed": "Failed to update settings",
  "settings.notifications.toast.enableFirst":
    "Please enable notifications first",
  "settings.notifications.toast.refreshFailed":
    "Failed to refresh notifications on this device",
  "settings.notifications.toast.testSent":
    "Test notification sent to this device",
  "settings.notifications.toast.testFailed": "Failed to send test notification",
  "settings.notifications.toast.localTriggered": "Local notification triggered",
  "settings.notifications.test.title": "Test Notification",
  "settings.notifications.test.body":
    "This is a server-sent test notification from Kagelin",
  "settings.notifications.test.localTitle": "Local Test Notification",
  "settings.notifications.test.localBody":
    "This notification was triggered locally from the browser.",

  // --- Android battery hint (AndroidBatteryHint.tsx) ---
  "settings.androidBattery.title": "Notifications may arrive late on Android.",
  "settings.androidBattery.body":
    "Chrome's battery optimization needs to be set to Unrestricted for pushes to reliably wake it on a locked, idle phone — this is Chrome's setting, not Kagelin's (an installed Android web app has no process of its own). Go to",
  "settings.androidBattery.path":
    "Settings → Apps → Chrome → Battery → Unrestricted",
  "settings.androidBattery.tail":
    ". On Samsung, Xiaomi, OnePlus, or Oppo phones this setting is often hidden, renamed, or layered under the manufacturer's own app-killer — if it's not where expected, search your phone's Settings app for \"battery optimization\".",
  "settings.androidBattery.dismiss": "Dismiss",

  // --- Backup & sync (BackupSyncSettings.tsx) ---
  "settings.backup.exportedAtFormat": (params: TranslationParams) =>
    `${params.date} at ${params.time}`,
  "settings.backup.tab.local": "Local Storage",
  "settings.backup.tab.github": "GitHub Repo",
  "settings.backup.tab.webdav": "WebDAV",
  "settings.backup.github.title": "GitHub Private Repo Sync",
  "settings.backup.github.description":
    "Use a private GitHub repository for seamless cross-device sync (Mac / Windows) and version history.",
  "settings.backup.github.token": "Personal Access Token",
  "settings.backup.github.tokenPlaceholder": "ghp_ or github_pat_...",
  "settings.backup.github.tokenHelp": "Create a GitHub token with 'repo' scope",
  "settings.backup.github.repo": "Repository",
  "settings.backup.github.repoPlaceholder": "username/kagelin-data",
  "settings.backup.github.branch": "Branch",
  "settings.backup.github.branchPlaceholder": "main",
  "settings.backup.github.deviceLabel": "Device Name",
  "settings.backup.github.deviceLabelPlaceholder":
    "e.g. MacBook, Dorm Windows PC",
  "settings.backup.github.test": "Test Connection",
  "settings.backup.github.syncNow": "Sync Now",
  "settings.backup.github.push": "Push to GitHub",
  "settings.backup.github.pull": "Pull from GitHub",
  "settings.backup.github.forget": "Clear Configuration",
  "settings.backup.github.autoStart": "Auto-pull on startup",
  "settings.backup.github.autoStartDesc":
    "Automatically pulls updates if another device pushed newer changes",
  "settings.backup.github.autoExit": "Auto-push before closing/blur",
  "settings.backup.github.autoExitDesc":
    "Pushes pending changes when window closes or loses focus",
  "settings.backup.github.autoDebounce": "Auto-push on edits",
  "settings.backup.github.autoDebounceDesc":
    "Silently pushes 30s after local edits",
  "settings.backup.github.lastSync": "Last synced: ",
  "settings.backup.github.neverSynced": "Never synced",
  "settings.backup.github.viewRepo": "View repository on GitHub",
  "settings.backup.github.pullConfirmTitle": "Pull data from GitHub?",
  "settings.backup.github.pullConfirmDesc":
    "This will download the latest data from GitHub and restore your local database (an automatic local snapshot will be saved). Continue?",
  "settings.backup.local.title": "Local Backup",
  "settings.backup.local.descriptionGuest":
    "Export your local data to a ZIP file or restore from a backup.",
  "settings.backup.local.descriptionCloud":
    "Export your cloud data to a ZIP file or restore from a backup.",
  "settings.backup.export": "Export",
  "settings.backup.import": "Import",
  "settings.backup.importOtherApps": "Import from other apps",
  "settings.backup.importFileAria": "Import backup file",
  "settings.backup.webdav.title": "WebDAV Backup",
  "settings.backup.webdav.description":
    "Keep a copy on a WebDAV server you control.",
  "settings.backup.webdav.serverUrl": "Server URL",
  "settings.backup.webdav.username": "Username",
  "settings.backup.webdav.usernamePlaceholder": "name",
  "settings.backup.webdav.password": "Password",
  "settings.backup.webdav.test": "Test Connection",
  "settings.backup.webdav.forget": "Forget credentials",
  "settings.backup.webdav.backUp": "Back Up",
  "settings.backup.webdav.restore": "Restore",
  "settings.backup.webdav.credentialsNote":
    "Your credentials are used only for this session — they aren't stored, and re-entering them is required after a reload.",
  "settings.backup.reminders.title": "Backup Reminders",
  "settings.backup.reminders.description":
    "Get nudged to export a backup, since your data is stored on this device only.",
  "settings.backup.reminders.toggleTitle": "Remind me to back up",
  "settings.backup.reminders.toggleDescription":
    "Periodic nudge to export your local data",
  "settings.backup.reminders.frequencyAria": "Reminder frequency",
  "settings.backup.reminders.frequencyPlaceholder": "Frequency",
  "settings.backup.reminders.weekly": "Weekly",
  "settings.backup.reminders.biweekly": "Biweekly",
  "settings.backup.reminders.monthly": "Monthly",
  "settings.backup.replace.title": "Replace your data?",
  "settings.backup.replace.descriptionWithDate": (params: TranslationParams) =>
    `This backup was taken ${params.date}. Restoring overwrites everything in your account with it — anything not in that backup is lost. This cannot be undone.`,
  "settings.backup.replace.description":
    "Restoring overwrites everything in your account with the backup on the server. Anything not in that backup is lost. This cannot be undone.",
  "settings.backup.sqlite.title": "SQLite Database (.db)",
  "settings.backup.sqlite.description":
    "Create an instant point-in-time SQLite snapshot or restore a database file directly.",
  "settings.backup.sqlite.snapshot": "Create Database Snapshot (.db)",
  "settings.backup.sqlite.restore": "Restore Database (.db)",
  "settings.backup.sqlite.snapshotSuccess":
    "SQLite snapshot downloaded successfully",
  "settings.backup.sqlite.snapshotFailed": "Failed to create SQLite snapshot",
  "settings.backup.sqlite.restoreSuccess":
    "SQLite database restored successfully",
  "settings.backup.sqlite.restoreFailed": "Failed to restore SQLite database",
  "settings.backup.sqlite.restoreConfirmTitle": "Restore SQLite Database?",
  "settings.backup.sqlite.restoreConfirmDescription":
    "Restoring from a SQLite file will replace the current local database and reload the workspace. Make sure you have a backup of your current database if needed.",
  "settings.backup.replace.confirm": "Replace",
  "settings.backup.toast.exported": "Backup downloaded successfully",
  "settings.backup.toast.exportFailed": "Failed to create backup",
  "settings.backup.toast.importing": (params: TranslationParams) =>
    `Importing ${params.name}...`,
  "settings.backup.toast.imported": (params: TranslationParams) =>
    `Restored ${params.tasks} tasks, ${params.projects} projects`,
  "settings.backup.toast.importFailed": "Failed to import backup",
  "settings.backup.toast.credentialsCleared": "Credentials cleared",
  "settings.backup.toast.fillAllFields": "Please fill in all WebDAV fields",
  "settings.backup.toast.connected": "Connected successfully",
  "settings.backup.toast.connectionFailed": "Connection failed",
  "settings.backup.toast.connectionTestFailed": "Connection test failed",
  "settings.backup.toast.configureFirst": "Configure WebDAV settings first",
  "settings.backup.toast.backedUp": "Backed up to server",
  "settings.backup.toast.backUpFailed": "Back up failed",
  "settings.backup.toast.downloadFailed": "Download failed",
  "settings.backup.toast.restored": "Data restored from server",
  "settings.backup.toast.restoreFailed": "Restore failed",
  "settings.github.error.invalidRepoFormat":
    "Invalid repository format. Please use username/repo format",
  "settings.github.error.missingToken":
    "Please provide a valid GitHub Personal Access Token",
  "settings.github.error.badCredentials":
    "Invalid or expired token (401 Bad credentials)",
  "settings.github.error.repoNotFound":
    "Repository not found or token lacks access (404 Not Found)",
  "settings.github.error.forbidden":
    "Access forbidden. Ensure token has 'repo' permission (403 Forbidden)",
  "settings.github.error.dataNotFoundOnRemote":
    "No kagelin-data.json found on remote. Click 'Push to GitHub' to initialize",
  "settings.github.error.conflict":
    "Remote has newer commits. Please pull before pushing",
  "settings.github.toast.connected":
    "Connected to GitHub repository successfully",
  "settings.github.toast.syncSuccess": "Synced with GitHub successfully",
  "settings.github.toast.pushSuccess":
    "Pushed latest data to GitHub successfully",
  "settings.github.toast.pullSuccess":
    "Pulled latest data from GitHub successfully",
  "settings.github.toast.autoPulled": (params: TranslationParams) =>
    `Auto-synced latest data from ${params.device}`,
  "settings.github.toast.autoMerged": (params: TranslationParams) =>
    `Automatically merged updates from ${params.device} and synced to GitHub`,
  "settings.github.toast.remoteUpdateConflict": (params: TranslationParams) =>
    `Remote update from ${params.device} detected, but local has unpushed changes. Please resolve in settings.`,
  "settings.github.toast.offlinePushSaved":
    "Currently offline. Changes are saved locally and will auto-sync once reconnected to GitHub",
  "settings.github.toast.offlinePullNotice":
    "Currently offline. Unable to reach GitHub, using local data",
  "settings.github.toast.reconnectSynced":
    "Network reconnected. Offline changes auto-synced to GitHub",
  "settings.github.toast.syncFailed": "GitHub sync failed",
  "settings.github.toast.configCleared": "GitHub sync configuration cleared",
  "settings.github.toast.alreadyInSync":
    "Local data is already in sync with the cloud",
  "settings.github.toast.dlpBlockedBackground":
    "Blocked a data-loss-risk push: local data is empty or sharply reduced; cloud data was not overwritten",
  "settings.github.toast.metaFallback":
    "Cloud metadata missing; deriving sync state from the data file instead",
  "settings.github.dlp.title":
    "High-risk action: push will overwrite cloud data",
  "settings.github.dlp.dangerDesc": (params: TranslationParams) =>
    `The cloud holds ${params.remote} entries, but the local copy only has ${params.local}. Continuing will overwrite the cloud with local data, which may wipe or sharply reduce it. This cannot be undone. Continue anyway?`,
  "settings.github.dlp.unreadableDesc":
    "The cloud data could not be read, so push safety cannot be verified. Continuing may overwrite existing cloud data. This cannot be undone. Continue anyway?",
  "settings.github.dlp.confirm": "Push anyway",
  "settings.github.deviceFallback": "Remote Device",

  // --- Conflict resolver dialog ---
  "settings.conflict.category.tasks": "Tasks",
  "settings.conflict.category.habits": "Habits & Entries",
  "settings.conflict.category.events": "Calendar & Schedule",
  "settings.conflict.category.projects": "Projects",
  "settings.conflict.category.workspaces": "Workspaces",
  "settings.conflict.action.keepLocal": "Keep Local",
  "settings.conflict.action.keepRemote": "Keep Remote",
  "settings.conflict.action.duplicate": "Keep Both as Two",
  "settings.conflict.batch.allLocal": "Use All Local",
  "settings.conflict.batch.allRemote": "Use All Remote",
  "settings.conflict.dialog.title": "Sync Conflicts Detected",
  "settings.conflict.dialog.description": (params: TranslationParams) =>
    `There are ${params.count} conflicts between this device and ${params.device} that cannot be merged automatically. Please choose which version to keep.`,
  "settings.conflict.dialog.pendingCount": (params: TranslationParams) =>
    `${params.count} conflict(s) to resolve`,
  "settings.conflict.dialog.applyAndPush": "Apply & Sync",
  "settings.conflict.dialog.rawJsonDiff": "View Raw JSON Diff",
  "settings.conflict.dialog.localVersion": "Current Device",
  "settings.conflict.dialog.remoteVersion": "Cloud Version",
  "settings.conflict.dialog.differingFields": "Differing Fields",
  "settings.conflict.dialog.deleteModifyDiff": "Delete/Modify conflict",
  "settings.conflict.dialog.deletedLocally": "Deleted locally",
  "settings.conflict.dialog.deletedRemotely": "Deleted on cloud",
  "settings.conflict.badge.tooltip": "Pending sync conflicts",
  "settings.conflict.badge.handle": "Resolve Conflicts",

  // --- Import dialog (ImportDialog.tsx) ---
  "settings.import.title": "Import Data",
  "settings.import.description":
    "Choose a file to migrate your data to Kagelin.",
  "settings.import.loopHabits": "Loop Habit Tracker",
  "settings.import.loopHabitsDescription": "Import from .db file (Android)",
  "settings.import.loopHabitsSelectAria":
    "Select Loop Habit Tracker database file",
  "settings.import.loopHabitsUploadAria":
    "Upload Loop Habit Tracker database file",
  "settings.import.ics": "ICS (Calendar)",
  "settings.import.icsDescription": "Import to Calendar",
  "settings.import.icsSelectAria": "Select iCalendar ICS file",
  "settings.import.icsUploadAria": "Upload iCalendar ICS file",
  "settings.import.select": "Select",
  "settings.import.cancel": "Cancel",

  // --- Delete user data dialog (DeleteUserDataDialog.tsx) ---
  "settings.deleteData.titleGuest": "Delete All Data",
  "settings.deleteData.titleCloud": "Delete Cloud Data",
  "settings.deleteData.descriptionGuest":
    "This action is permanent and cannot be undone. All your local habits, tasks, and settings will be permanently erased.",
  "settings.deleteData.descriptionCloud":
    "This action is permanent and cannot be undone. All your habits, tasks, and cloud settings will be permanently erased from our servers.",
  "settings.deleteData.typePrompt": "Type",
  "settings.deleteData.typeWord": "delete",
  "settings.deleteData.typeSuffix": "to confirm",
  "settings.deleteData.placeholder": "Type 'delete'...",
  "settings.deleteData.confirm": "Delete Account Data",
  "settings.deleteData.confirmMobile": "Permanently Delete Data",
  "settings.deleteData.cancel": "Cancel",

  // --- Privacy (PrivacySection.tsx) ---
  "settings.privacy.title": "Share Anonymous Telemetry",
  "settings.privacy.description":
    "Help improve Kagelin by sharing anonymous usage metrics (feature usage, timer durations, platform). Personal data, task titles, and notes are never collected or transmitted. See our",

  // --- PWA install row (PwaInstallRow.tsx) ---
  "settings.pwa.addToHomeScreen": "Add to Home Screen",
  "settings.pwa.installApp": "Install app",
  "settings.pwa.hide": "Hide",
  "settings.pwa.showMeHow": "Show me how",
  "settings.pwa.install": "Install",
  "settings.pwa.iosHint":
    'Tap the Share icon, then select "Add to Home Screen".',
  "settings.pwa.browserMenuHint":
    "Use your browser's menu to install this app.",

  // --- About sheet (AboutSheet.tsx) ---
  "settings.about.title": "About Kagelin",
  "settings.about.whatsNew": "What's New",
  "settings.about.whatsNewDetail": "Recent changes and releases",
  "settings.about.sourceVersion": (params: TranslationParams) =>
    `Source (v${params.version})`,
  "settings.about.sourceVersionDetail": "This exact build on GitHub",
  "settings.about.sourceCode": "Source code",
  "settings.about.reportIssue": "Report an Issue",
  "settings.about.reportIssueDetail": "File a bug or feature request",
  "settings.about.license": "License",
  "settings.about.privacyPolicy": "Privacy Policy",
  "settings.about.terms": "Terms of Service",
  "settings.about.oss": "Open-source software",
  "settings.about.ossDetail": "Full list of dependencies",

  // --- MCP channel card (McpChannelCard.tsx) ---
  "settings.mcp.title": "AI MCP Architect Channel",
  "settings.mcp.description":
    "Serve this app's local data to Claude Desktop, Cursor, or Claude Code through the built-in MCP endpoint.",
  "settings.mcp.desktopOnly":
    "The MCP endpoint is served by the desktop app's embedded server. Install and run the Kagelin desktop build to connect a client.",
  "settings.mcp.statusEnabled": "Listening",
  "settings.mcp.statusDisabled": "Disabled",
  "settings.mcp.enableLabel": "Enable MCP endpoint",
  "settings.mcp.urlLabel": "URL",
  "settings.mcp.tokenLabel": "Access token",
  "settings.mcp.showToken": "Show token",
  "settings.mcp.hideToken": "Hide token",
  "settings.mcp.copyUrl": "Copy URL",
  "settings.mcp.copyToken": "Copy token",
  "settings.mcp.copied": "Copied to clipboard",
  "settings.mcp.copyFailed": "Could not copy to the clipboard",
  "settings.mcp.resetToken": "Reset token",
  "settings.mcp.resetTokenTitle": "Reset the MCP access token?",
  "settings.mcp.resetTokenDescription":
    "Connected clients stop working until you paste the new token into their configuration.",
  "settings.mcp.tokenReset": "MCP token reset",
  "settings.mcp.updateFailed": "Could not update the MCP endpoint",
  "settings.mcp.snippetsTitle": "Client configurations",
  "settings.mcp.snippetsHint":
    "Copy a configuration into the matching client, then restart it.",
  "settings.mcp.snippetClaudeDesktop": "Claude Desktop",
  "settings.mcp.snippetClaudeDesktopHint":
    "Paste into claude_desktop_config.json",
  "settings.mcp.snippetCursor": "Cursor",
  "settings.mcp.snippetCursorHint": "Paste into ~/.cursor/mcp.json",
  "settings.mcp.snippetClaudeCode": "Claude Code CLI",
  "settings.mcp.snippetClaudeCodeHint": "Run once in your terminal",
  "settings.mcp.copySnippet": "Copy configuration",
} satisfies Record<string, DictionaryValue>;
