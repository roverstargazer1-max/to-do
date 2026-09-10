import type { DictionaryValue, TranslationParams } from "../../types";

/**
 * English `calendar` module (ticket 07). Terminology per spec/CONTEXT.md:
 * Calendar→日历, Event→事件, Sync→同步, Schedule→日程 (the agenda view, not
 * "timetable"). Kagelin is never translated. Sync toasts are shared between
 * CalendarToolbar and ImportExportMenu; ICS import strings between
 * ImportExportMenu and useIcsImport — one key set each.
 */
export const calendar = {
  // Toolbar
  "calendar.toolbar.today": "Today",
  "calendar.toolbar.prevPeriod": "Previous period",
  "calendar.toolbar.nextPeriod": "Next period",
  "calendar.toolbar.goToToday": "Go to today",
  "calendar.toolbar.sync": "Sync calendars",
  "calendar.toolbar.newEvent": "New Event",
  "calendar.toolbar.view.year": "Year",
  "calendar.toolbar.view.month": "Month",
  "calendar.toolbar.view.week": "Week",
  "calendar.toolbar.view.4day": "4-Day",
  "calendar.toolbar.view.3day": "3-Day",
  "calendar.toolbar.view.day": "Day",
  "calendar.toolbar.view.schedule": "Schedule",

  // Sync toasts (CalendarToolbar + ImportExportMenu) and summary
  // (run-sync.ts formatSyncSummary)
  "calendar.sync.loading": "Syncing calendar…",
  "calendar.sync.notConfigured":
    "No calendars configured yet. Connect a calendar first.",
  "calendar.sync.completedWithErrors": (params: TranslationParams): string =>
    `Sync completed with errors: ${params.error}`,
  "calendar.sync.failed": "Sync failed",
  "calendar.sync.added": (params: TranslationParams): string =>
    `${params.count} added`,
  "calendar.sync.updated": (params: TranslationParams): string =>
    `${params.count} updated`,
  "calendar.sync.removed": (params: TranslationParams): string =>
    `${params.count} removed`,
  "calendar.sync.pushed": (params: TranslationParams): string =>
    `${params.count} pushed`,
  "calendar.sync.summary": (params: TranslationParams): string =>
    `Synced — ${params.parts}`,
  "calendar.sync.upToDate": "Calendar is up to date",

  // Connect dialog
  "calendar.connect.trigger": "Connect Calendar",
  "calendar.connect.title": "Connect Calendar",
  "calendar.connect.providerCalendars": (params: TranslationParams): string =>
    `${params.provider} Calendars`,
  "calendar.connect.selectDescription":
    "Sync your events from external providers.",
  "calendar.connect.pickDescription":
    "Choose which calendars to sync with Kagelin.",
  "calendar.connect.connected": "Connected",
  "calendar.connect.chooseCalendars": (params: TranslationParams): string =>
    `Choose ${params.provider} calendars`,
  "calendar.connect.calendars": "Calendars",
  "calendar.connect.disconnect": (params: TranslationParams): string =>
    `Disconnect ${params.provider}`,
  "calendar.connect.disconnected": (params: TranslationParams): string =>
    `${params.provider} disconnected`,
  "calendar.connect.connectedToast": (params: TranslationParams): string =>
    `${params.provider} Calendar connected`,
  "calendar.connect.loading": "Loading calendars…",
  "calendar.connect.noneFound": "No calendars found for this account.",
  "calendar.connect.back": "Back",
  "calendar.connect.saving": "Saving…",
  "calendar.connect.save": (params: TranslationParams): string =>
    params.count === 1
      ? `Save ${params.count} calendar`
      : `Save ${params.count} calendars`,
  "calendar.connect.listFailed": "Failed to list calendars",
  "calendar.connect.saveFailed": "Failed to save",
  "calendar.connect.savedToast": "Calendars saved — run Sync to pull events",
  "calendar.connect.saveCalendarsFailed": "Failed to save calendars",

  // Import/export menu
  "calendar.menu.srLabel": "Calendar options",
  "calendar.menu.syncSettings": "Sync & Settings",
  "calendar.menu.syncNow": "Sync Now",
  "calendar.menu.syncing": "Syncing…",
  "calendar.menu.manage": "Manage Calendars",
  "calendar.menu.data": "Calendar Data",
  "calendar.menu.importIcs": "Import .ics file",
  "calendar.menu.importAria": "Import ICS file",
  "calendar.menu.exportIcs": "Export to .ics",
  "calendar.menu.exportedToast": "Calendar exported to .ics",
  "calendar.menu.exportFailed": "Failed to export calendar",

  // ICS import flow (ImportExportMenu + useIcsImport)
  "calendar.ics.importing": (params: TranslationParams): string =>
    `Importing ${params.file}...`,
  "calendar.ics.parseFailed": "Failed to parse ICS file",
  "calendar.ics.noValidEvents": "No valid events found in file",
  "calendar.ics.imported": (params: TranslationParams): string =>
    `Successfully imported ${params.count} events`,
  "calendar.ics.warnings": (params: TranslationParams): string =>
    `${params.count} events had parsing warnings.`,
  "calendar.ics.criticalError": "Critical error during import",

  // Reconnect banner (#57) — the provider name is bolded in its own span
  "calendar.reconnect.calendarWord": "Calendar",
  "calendar.reconnect.message":
    "needs reconnecting — sync is paused until you sign in again.",
  "calendar.reconnect.action": "Reconnect",

  // Event create/edit dialog
  "calendar.event.editTitle": "Edit Event",
  "calendar.event.createTitle": "Create Event",
  "calendar.event.editDescription": "Edit this calendar event",
  "calendar.event.createDescription": "Add a new event to your calendar",
  "calendar.event.titlePlaceholder": "Add title",
  "calendar.event.titleRequired": "Title is required",
  "calendar.event.allDay": "All day",
  "calendar.event.pickDate": "Pick a date",
  "calendar.event.pickEndTime": "Pick an end time",
  "calendar.event.addLocation": "Add location",
  "calendar.event.clearLocation": "Clear location",
  "calendar.event.locationPlaceholder": "Search or enter location...",
  "calendar.event.noLocations": "No locations found",
  "calendar.event.custom": "Custom",
  "calendar.event.useLocation": (params: TranslationParams): string =>
    `Use "${params.query}"`,
  "calendar.event.suggestions": "Suggestions",
  "calendar.event.notesPlaceholder": "Add notes",
  "calendar.event.notesLabel": "Event notes",
  "calendar.event.delete": "Delete event",
  "calendar.event.saveChanges": "Save changes",
  "calendar.event.create": "Create event",
  "calendar.event.recurringTooltip":
    "Recurring events can only be edited in the source calendar",
  // Predefined location suggestions (stored value follows the UI language)
  "calendar.event.location.coffeeShop": "Coffee Shop",
  "calendar.event.location.office": "Office",
  "calendar.event.location.zoomMeeting": "Zoom Meeting",
  "calendar.event.location.googleMeet": "Google Meet",
  "calendar.event.location.home": "Home",
  "calendar.event.location.library": "Library",
  "calendar.event.location.gym": "Gym",

  // Views
  "calendar.view.more": " more",
  "calendar.view.noEvents": "No events",

  // OAuth callback surfacing (app/calendar/page.tsx)
  "calendar.page.connectionFailed": (params: TranslationParams): string =>
    `Calendar connection failed: ${params.error}`,
} satisfies Record<string, DictionaryValue>;
