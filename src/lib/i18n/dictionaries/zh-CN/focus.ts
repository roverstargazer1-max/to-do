import type { DictionaryValue, TranslationParams } from "../../types";

/**
 * zh-CN `focus` module — mirrors `dictionaries/en/focus.ts` exactly
 * (enforced by the `Dictionary` type at the locale index). Terminology per
 * spec/CONTEXT.md: Focus→专注, Break→休息, Session→轮 (pomodoro round),
 * Cycle→循环.
 */
export const focus = {
  // Mode labels (focus page, floating timer, PiP timer, settings)
  "focus.mode.focus": "专注",
  "focus.mode.shortBreak": "短休息",
  "focus.mode.longBreak": "长休息",

  // Session line (focus page, floating timer, PiP timer)
  "focus.session.of": (params: TranslationParams): string =>
    `第 ${params.current} / ${params.total} 轮`,
  "focus.session.n": (params: TranslationParams): string =>
    `第 ${params.current} 轮`,
  "focus.session.cycleComplete": "循环完成",
  "focus.session.breakAfter": (params: TranslationParams): string =>
    `第 ${params.current} 轮后休息`,
  "focus.session.today": (params: TranslationParams): string =>
    `今日 ${params.count}`,

  // Picture-in-Picture
  "focus.pip.open": "打开画中画",
  "focus.pip.close": "关闭画中画",
  "focus.pip.viewingTitle": "正在画中画模式",
  "focus.pip.viewingDescription":
    "计时器正在悬浮窗中运行。你可以在 Kagelin 中浏览其他页面。",
  "focus.pip.return": "返回主视图",

  // Timer controls & toasts (components + useFocusTimer)
  "focus.timer.pause": "暂停计时器",
  "focus.timer.start": "开始计时器",
  "focus.timer.maximize": "最大化计时器",
  "focus.timer.close": "关闭计时器",
  "focus.timer.cancel": "取消本轮",
  "focus.timer.cancelledToast": "本轮已取消",
  "focus.timer.sessionCompleted": "专注完成",
  "focus.timer.breakCompleted": "休息完成",
  "focus.timer.autoStartedShortBreak": "已自动开始短休息",
  "focus.timer.autoStartedFocus": "已自动开始专注",
  "focus.timer.ready": "计时器已准备好开始下一轮。",

  // Push notifications (useFocusTimer)
  "focus.notify.focusTitle": "专注完成",
  "focus.notify.breakTitle": "休息结束",
  "focus.notify.focusBody": "本轮专注已完成，休息一下吧！",
  "focus.notify.breakBody": "休息结束，开始专注吧！",

  // Sync indicator
  "focus.sync.synced": "会话正在多设备间同步",
  "focus.sync.offline": "离线——会话未同步",
  "focus.sync.syncing": "同步中",

  // Task picker
  "focus.taskPicker.nowFocusing": (params: TranslationParams): string =>
    `正在专注：${params.task}`,
  "focus.taskPicker.change": (params: TranslationParams): string =>
    `更改专注任务：${params.task}`,
  "focus.taskPicker.select": "选择专注任务",
  "focus.taskPicker.emptyTitle": "今天没有到期任务",
  "focus.taskPicker.emptyDescription": "安排在今天的任务会显示在这里。",
  "focus.taskPicker.overdue": "已逾期",
  "focus.taskPicker.today": "今天",
  "focus.taskPicker.loading": "加载中…",
  "focus.taskPicker.addTask": "添加任务",
  "focus.taskPicker.title": "专注于",

  // Subtask step counter
  "focus.subtask.steps": (params: TranslationParams): string =>
    `${params.completed}/${params.total} 步`,

  // Fullscreen toggle
  "focus.fullscreen.exit": "退出全屏",
  "focus.fullscreen.enter": "进入全屏",

  // Settings dialog
  "focus.settings.focusDuration": "专注时长",
  "focus.settings.shortBreak": "短休息",
  "focus.settings.longBreak": "长休息",
  "focus.settings.sessionsUntilLongBreak": "长休息前的轮数",
  "focus.settings.min": "分钟",
  "focus.settings.autoStartBreaks": "自动开始休息",
  "focus.settings.autoStartBreaksDescription": "专注结束后自动开始休息计时",
  "focus.settings.autoStartFocus": "自动开始专注",
  "focus.settings.autoStartFocusDescription": "休息结束后自动开始专注计时",
  "focus.settings.onTaskSwitch": "切换任务时",
  "focus.settings.onTaskSwitchDescription": "专注过程中切换任务时的处理方式",
  "focus.settings.keep": "保留",
  "focus.settings.pause": "暂停",
  "focus.settings.reset": "重置",
  "focus.settings.adjust": "调整设置",
  "focus.settings.title": "计时器设置",
  "focus.settings.description": "自定义专注与休息时长",
  "focus.settings.formSr": "更新计时器时长与过渡的表单",
  "focus.settings.resetAria": "重置为已保存的设置",
  "focus.settings.saveAria": "保存更改",
  // Render-boundary mapping of FocusSettingsSchema literals (schema itself
  // is test-asserted and stays English; the dialog maps known values).
  "focus.settings.errorFocusDuration": "专注时长至少为 1 分钟",
  "focus.settings.errorShortBreak": "短休息至少为 1 分钟",
  "focus.settings.errorLongBreak": "长休息至少为 5 分钟",
  "focus.settings.errorSessions": "至少需要 2 轮",
} satisfies Record<string, DictionaryValue>;
