import type { DictionaryValue, TranslationParams } from "../../types";

/**
 * English `focus` module (ticket 07). Terminology per spec/CONTEXT.md:
 * Focus→专注, Break→休息, Session→轮 (pomodoro round), Cycle→循环.
 * Mode labels and session lines are shared across the focus page, the
 * floating timer, and the PiP timer — one key set each.
 */
export const focus = {
  // Mode labels (focus page, floating timer, PiP timer, settings)
  "focus.mode.focus": "Focus",
  "focus.mode.shortBreak": "Short Break",
  "focus.mode.longBreak": "Long Break",

  // Session line (focus page, floating timer, PiP timer)
  "focus.session.of": (params: TranslationParams): string =>
    `Session ${params.current} of ${params.total}`,
  "focus.session.n": (params: TranslationParams): string =>
    `Session ${params.current}`,
  "focus.session.cycleComplete": "Cycle Complete",
  "focus.session.breakAfter": (params: TranslationParams): string =>
    `Break after Session ${params.current}`,
  "focus.session.today": (params: TranslationParams): string =>
    `${params.count} TODAY`,

  // Picture-in-Picture
  "focus.pip.open": "Open Picture-in-Picture",
  "focus.pip.close": "Close Picture-in-Picture",
  "focus.pip.viewingTitle": "Viewing in PiP",
  "focus.pip.viewingDescription":
    "The timer is running in a floating window. You can browse other pages in Kagelin.",
  "focus.pip.return": "Return to main view",

  // Timer controls & toasts (components + useFocusTimer)
  "focus.timer.pause": "Pause timer",
  "focus.timer.start": "Start timer",
  "focus.timer.maximize": "Maximize timer",
  "focus.timer.close": "Close timer",
  "focus.timer.cancel": "Cancel session",
  "focus.timer.cancelledToast": "Session cancelled",
  "focus.timer.sessionCompleted": "Focus session completed",
  "focus.timer.breakCompleted": "Break completed",
  "focus.timer.autoStartedShortBreak": "Automatically started short break",
  "focus.timer.autoStartedFocus": "Automatically started focus",
  "focus.timer.ready": "The timer is ready for your next session.",

  // Push notifications (useFocusTimer)
  "focus.notify.focusTitle": "Focus Complete",
  "focus.notify.breakTitle": "Break Complete",
  "focus.notify.focusBody": "Your focus session is complete. Take a break!",
  "focus.notify.breakBody": "Your break is over. Time to focus!",

  // Sync indicator
  "focus.sync.synced": "Session syncing across devices",
  "focus.sync.offline": "Offline — session not syncing",
  "focus.sync.syncing": "Syncing",

  // Task picker
  "focus.taskPicker.nowFocusing": (params: TranslationParams): string =>
    `Now focusing on ${params.task}`,
  "focus.taskPicker.change": (params: TranslationParams): string =>
    `Change focus task: ${params.task}`,
  "focus.taskPicker.select": "Select focus task",
  "focus.taskPicker.emptyTitle": "Nothing due today",
  "focus.taskPicker.emptyDescription":
    "Tasks scheduled for today will appear here.",
  "focus.taskPicker.overdue": "overdue",
  "focus.taskPicker.today": "today",
  "focus.taskPicker.loading": "Loading...",
  "focus.taskPicker.addTask": "Add task",
  "focus.taskPicker.title": "Focus on",

  // Subtask step counter
  "focus.subtask.steps": (params: TranslationParams): string =>
    `${params.completed}/${params.total} steps`,

  // Fullscreen toggle
  "focus.fullscreen.exit": "Exit fullscreen",
  "focus.fullscreen.enter": "Enter fullscreen",

  // Settings dialog
  "focus.settings.focusDuration": "Focus Duration",
  "focus.settings.shortBreak": "Short Break",
  "focus.settings.longBreak": "Long Break",
  "focus.settings.sessionsUntilLongBreak": "Sessions Until Long Break",
  "focus.settings.min": "min",
  "focus.settings.autoStartBreaks": "Auto-start Breaks",
  "focus.settings.autoStartBreaksDescription":
    "Automatically start break timer after focus session",
  "focus.settings.autoStartFocus": "Auto-start Focus",
  "focus.settings.autoStartFocusDescription":
    "Automatically start focus timer after break",
  "focus.settings.onTaskSwitch": "On task switch",
  "focus.settings.onTaskSwitchDescription":
    "What happens when you change tasks during a session",
  "focus.settings.keep": "Keep",
  "focus.settings.pause": "Pause",
  "focus.settings.reset": "Reset",
  "focus.settings.adjust": "Adjust Settings",
  "focus.settings.title": "Timer Settings",
  "focus.settings.description": "Customize your focus and break durations",
  "focus.settings.formSr": "Form to update timer durations and transitions",
  "focus.settings.resetAria": "Reset to saved settings",
  "focus.settings.saveAria": "Save changes",
  // Render-boundary mapping of FocusSettingsSchema literals (schema itself
  // is test-asserted and stays English; the dialog maps known values).
  "focus.settings.errorFocusDuration":
    "Focus duration must be at least 1 minute",
  "focus.settings.errorShortBreak": "Short break must be at least 1 minute",
  "focus.settings.errorLongBreak": "Long break must be at least 5 minutes",
  "focus.settings.errorSessions": "Must be at least 2 sessions",
} satisfies Record<string, DictionaryValue>;
