import type { DictionaryValue, TranslationParams } from "../../types";

/**
 * zh-CN `calendar` module — mirrors `dictionaries/en/calendar.ts` exactly
 * (enforced by the `Dictionary` type at the locale index). Terminology per
 * spec/CONTEXT.md: Calendar→日历, Event→事件, Sync→同步, Schedule→日程.
 * Kagelin is never translated.
 */
export const calendar = {
  // Toolbar
  "calendar.toolbar.today": "今天",
  "calendar.toolbar.prevPeriod": "上一时段",
  "calendar.toolbar.nextPeriod": "下一时段",
  "calendar.toolbar.goToToday": "回到今天",
  "calendar.toolbar.sync": "同步日历",
  "calendar.toolbar.newEvent": "新建事件",
  "calendar.toolbar.view.year": "年",
  "calendar.toolbar.view.month": "月",
  "calendar.toolbar.view.week": "周",
  "calendar.toolbar.view.4day": "4 天",
  "calendar.toolbar.view.3day": "3 天",
  "calendar.toolbar.view.day": "日",
  "calendar.toolbar.view.schedule": "日程",

  // Sync toasts (CalendarToolbar + ImportExportMenu) and summary
  // (run-sync.ts formatSyncSummary)
  "calendar.sync.loading": "正在同步日历…",
  "calendar.sync.notConfigured": "还没有配置日历。请先连接一个日历。",
  "calendar.sync.completedWithErrors": (params: TranslationParams): string =>
    `同步完成，但有错误：${params.error}`,
  "calendar.sync.failed": "同步失败",
  "calendar.sync.added": (params: TranslationParams): string =>
    `新增 ${params.count} 条`,
  "calendar.sync.updated": (params: TranslationParams): string =>
    `更新 ${params.count} 条`,
  "calendar.sync.removed": (params: TranslationParams): string =>
    `移除 ${params.count} 条`,
  "calendar.sync.pushed": (params: TranslationParams): string =>
    `推送 ${params.count} 条`,
  "calendar.sync.summary": (params: TranslationParams): string =>
    `已同步 — ${params.parts}`,
  "calendar.sync.upToDate": "日历已是最新",

  // Connect dialog
  "calendar.connect.trigger": "连接日历",
  "calendar.connect.title": "连接日历",
  "calendar.connect.providerCalendars": (params: TranslationParams): string =>
    `${params.provider} 日历`,
  "calendar.connect.selectDescription": "从外部服务商同步你的事件。",
  "calendar.connect.pickDescription": "选择要与 Kagelin 同步的日历。",
  "calendar.connect.connected": "已连接",
  "calendar.connect.chooseCalendars": (params: TranslationParams): string =>
    `选择 ${params.provider} 日历`,
  "calendar.connect.calendars": "日历",
  "calendar.connect.disconnect": (params: TranslationParams): string =>
    `断开 ${params.provider}`,
  "calendar.connect.disconnected": (params: TranslationParams): string =>
    `${params.provider} 已断开连接`,
  "calendar.connect.connectedToast": (params: TranslationParams): string =>
    `${params.provider} 日历已连接`,
  "calendar.connect.loading": "正在加载日历…",
  "calendar.connect.noneFound": "该账号下未找到日历。",
  "calendar.connect.back": "返回",
  "calendar.connect.saving": "保存中…",
  "calendar.connect.save": (params: TranslationParams): string =>
    params.count === 1
      ? `保存 ${params.count} 个日历`
      : `保存 ${params.count} 个日历`,
  "calendar.connect.listFailed": "日历列表获取失败",
  "calendar.connect.saveFailed": "保存失败",
  "calendar.connect.savedToast": "日历已保存——运行同步以拉取事件",
  "calendar.connect.saveCalendarsFailed": "日历保存失败",

  // Import/export menu
  "calendar.menu.srLabel": "日历选项",
  "calendar.menu.syncSettings": "同步与设置",
  "calendar.menu.syncNow": "立即同步",
  "calendar.menu.syncing": "同步中…",
  "calendar.menu.manage": "管理日历",
  "calendar.menu.data": "日历数据",
  "calendar.menu.importIcs": "导入 .ics 文件",
  "calendar.menu.importAria": "导入 ICS 文件",
  "calendar.menu.exportIcs": "导出为 .ics",
  "calendar.menu.exportedToast": "日历已导出为 .ics",
  "calendar.menu.exportFailed": "日历导出失败",

  // ICS import flow (ImportExportMenu + useIcsImport)
  "calendar.ics.importing": (params: TranslationParams): string =>
    `正在导入 ${params.file}…`,
  "calendar.ics.parseFailed": "解析 ICS 文件失败",
  "calendar.ics.noValidEvents": "文件中没有有效事件",
  "calendar.ics.imported": (params: TranslationParams): string =>
    `成功导入 ${params.count} 个事件`,
  "calendar.ics.warnings": (params: TranslationParams): string =>
    `${params.count} 个事件存在解析警告。`,
  "calendar.ics.criticalError": "导入过程中发生严重错误",

  // Reconnect banner (#57) — the provider name is bolded in its own span
  "calendar.reconnect.calendarWord": "日历",
  "calendar.reconnect.message": "需要重新连接——在你重新登录前，同步已暂停。",
  "calendar.reconnect.action": "重新连接",

  // Event create/edit dialog
  "calendar.event.editTitle": "编辑事件",
  "calendar.event.createTitle": "新建事件",
  "calendar.event.editDescription": "编辑这条日历事件",
  "calendar.event.createDescription": "向你的日历添加新事件",
  "calendar.event.titlePlaceholder": "添加标题",
  "calendar.event.titleRequired": "标题不能为空",
  "calendar.event.allDay": "全天",
  "calendar.event.pickDate": "选择日期",
  "calendar.event.pickEndTime": "选择结束时间",
  "calendar.event.addLocation": "添加地点",
  "calendar.event.clearLocation": "清除地点",
  "calendar.event.locationPlaceholder": "搜索或输入地点…",
  "calendar.event.noLocations": "未找到地点",
  "calendar.event.custom": "自定义",
  "calendar.event.useLocation": (params: TranslationParams): string =>
    `使用「${params.query}」`,
  "calendar.event.suggestions": "建议",
  "calendar.event.notesPlaceholder": "添加备注",
  "calendar.event.notesLabel": "事件备注",
  "calendar.event.delete": "删除事件",
  "calendar.event.saveChanges": "保存更改",
  "calendar.event.create": "创建事件",
  "calendar.event.recurringTooltip": "循环事件只能在来源日历中编辑",
  // Predefined location suggestions (stored value follows the UI language)
  "calendar.event.location.coffeeShop": "咖啡馆",
  "calendar.event.location.office": "办公室",
  "calendar.event.location.zoomMeeting": "Zoom 会议",
  "calendar.event.location.googleMeet": "Google Meet",
  "calendar.event.location.home": "家",
  "calendar.event.location.library": "图书馆",
  "calendar.event.location.gym": "健身房",

  // Views
  "calendar.view.more": "更多",
  "calendar.view.noEvents": "暂无事件",

  // OAuth callback surfacing (app/calendar/page.tsx)
  "calendar.page.connectionFailed": (params: TranslationParams): string =>
    `日历连接失败：${params.error}`,
} satisfies Record<string, DictionaryValue>;
