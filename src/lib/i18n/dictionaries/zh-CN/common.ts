import type { DictionaryValue, TranslationParams } from "../../types";

/**
 * zh-CN `common` module — mirrors `dictionaries/en/common.ts` exactly
 * (enforced by the `Dictionary` type at the locale index). Glossary:
 * Workspace→工作台, Task→任务, Habit→习惯, Focus→专注, Kagelin 永不翻译.
 */
export const common = {
  "common.ok": "确定",
  "common.cancel": "取消",
  // Kagelin is never translated (spec terminology) — same value per locale.
  "common.appTitle": "Kagelin",
  // Chinese has no pluralization — the count is always interpolated (D-07).
  "common.itemCount": (params: TranslationParams) => `${params.count} 项`,
  "common.loading": "加载中…",
  "common.search": "搜索",

  // Navigation
  "common.nav.allTasks": "全部任务",
  "common.nav.habits": "习惯",
  "common.nav.calendar": "日历",
  "common.nav.stats": "统计",
  "common.nav.statistics": "统计",
  "common.nav.focus": "专注",
  "common.nav.settings": "设置",
  "common.nav.home": "主页",
  "common.nav.workspaces": "工作台",

  // Sidebar
  "common.sidebar.projects": "项目",
  "common.sidebar.addProject": "添加项目",
  "common.sidebar.inbox": "收件箱",
  "common.sidebar.editProject": "编辑项目",
  "common.sidebar.deleteProject": "删除项目",
  "common.sidebar.archivedProjects": "已归档项目",
  "common.sidebar.addWorkspace": "添加工作台",
  "common.sidebar.renameWorkspace": "重命名工作台",
  "common.sidebar.deleteWorkspace": "删除工作台",
  "common.sidebar.more": "更多",
  "common.sidebar.whatsNew": "新功能",
  "common.sidebar.build": "版本",
  "common.sidebar.preview": "预览版",
  "common.sidebar.actionPrompt": "你想做什么？",
  "common.sidebar.toggle": "切换侧边栏",
  "common.sidebar.title": "侧边栏",
  "common.sidebar.mobileDescription": "显示移动端侧边栏。",

  // Header (mobile)
  "common.header.moreOptions": "更多选项",
  "common.header.whatsNewAria": "新功能 — 有新版本可用",
  "common.header.completedTasks": "已完成任务",

  // Generic confirmation dialogs
  "common.dialog.deleteTitle": "删除任务",
  "common.dialog.deleteDescription": "确定要删除这个任务吗？此操作无法撤销。",
  "common.dialog.delete": "删除",
  "common.dialog.signOutTitle": "退出登录",
  "common.dialog.signOutDescription":
    "确定要退出登录吗？之后需要重新登录才能访问你的任务。",
  "common.dialog.signOutConfirm": "退出登录",
  "common.dialog.deleteProjectDescription": (params: TranslationParams) =>
    `确定要删除“${params.name}”吗？请选择如何处理它的任务。`,
  "common.dialog.deleteAllTasks": "删除全部任务",
  "common.dialog.moveToInbox": "移至收件箱",
  "common.dialog.keepArchived": "保留归档",

  // 项目新建/编辑对话框（CreateProjectDialog / EditProjectDialog）
  "common.project.createTitle": "新建项目",
  "common.project.createDescription": "把任务整理进一个新项目。",
  "common.project.editDescription": "更新项目名称与颜色。",
  "common.project.nameLabel": "项目名称",
  "common.project.namePlaceholder": "工作、个人、学习…",
  "common.project.editNamePlaceholder": "项目名称…",
  "common.project.colorLabel": "项目颜色",
  "common.project.nameError": "请输入项目名称",
  "common.project.editNameLabel": "项目名称",
  "common.project.editNameError": "请输入名称",
  "common.project.invalidColor": "颜色格式无效",
  "common.project.create": "创建项目",
  "common.project.creating": "正在创建项目",
  "common.project.save": "保存项目",
  "common.project.saving": "正在保存项目",

  // 已归档项目对话框（projects/ArchivedProjectsDialog.tsx）
  "common.projects.archivedDescription": "查看并恢复已归档的项目",
  "common.projects.archivedEmptyTitle": "没有已归档项目",
  "common.projects.archivedEmptyDescription":
    "你归档的项目会显示在这里，可随时恢复。",
  "common.projects.restore": "恢复",

  // ui/dialog.tsx 与 ui/sheet.tsx 共用的关闭标签
  "common.ui.close": "关闭",

  // Shared sheet tab toggle (tasks + habits)
  "common.tab.edit": "编辑",
  "common.tab.insights": "洞察",

  // Shared mutation error toasts (lib/utils/mutation-error.ts)
  "common.errors.network": "网络错误，更改未能保存。",
  "common.errors.auth": "认证错误，请重新登录。",
  "common.errors.generic": "发生错误。",
  "common.errors.unexpected": "发生了意外错误。",
  "common.errors.unknown": "未知错误",

  // Global sync indicator (ui/SyncIndicator.tsx)
  "common.syncing": "同步中",
  "common.syncingStatus": "同步中…",

  // Guest-data migration overlay (layout/AppShell.tsx)
  "common.migratingGuestData": "正在迁移访客数据…",

  // Segmented time picker (ui/segmented-time-picker.tsx)
  "common.timepicker.adjustHours": "调整小时",
  "common.timepicker.adjustMinutes": "调整分钟",
  "common.timepicker.toggleAmpm": "切换上午/下午",

  // 主页（app/page.tsx → HomeClient）
  "common.home.greetingMorning": "早上好",
  "common.home.greetingAfternoon": "下午好",
  "common.home.greetingEvening": "晚上好",
  "common.home.highPriority": "高优先级",
  "common.home.clearFilter": "清除筛选",

  // PWA 安装提示（home/PwaInstallHint.tsx）
  "common.pwa.iosTitle": "将 Kagelin 添加到主屏幕",
  "common.pwa.iosDescription":
    "点按“分享”，然后选择“添加到主屏幕”。开启通知也需要这一步。",
  "common.pwa.installTitle": "安装 Kagelin",
  "common.pwa.installDescription": "支持离线使用，并可从主屏幕直接启动。",

  // 遥测同意提示（telemetry/TelemetryConsentPrompt.tsx）
  "common.telemetry.regionLabel": "遥测同意",
  "common.telemetry.message":
    "Kagelin 是开源且隐私优先的。是否共享匿名遥测数据以帮助改进应用？请参阅我们的",
  "common.telemetry.dismiss": "不用了",
  "common.telemetry.enable": "开启",
  "common.telemetry.closeAria": "关闭",

  // 拒绝访问页（app/access-denied/page.tsx）
  "common.accessDenied.title": "仅限私人访问",
  "common.accessDenied.description":
    "此应用仅供个人使用。如果你认为自己应当拥有访问权限，请联系所有者。",
  "common.accessDenied.backToLogin": "返回登录",

  // 错误边界（app/error.tsx）
  "common.error.title": "出错了",
  "common.error.description":
    "Kagelin 遇到了意外错误。你的数据是安全的——请重试；如果问题持续出现，可以返回主页。",
  "common.error.goHome": "返回主页",
  "common.error.tryAgain": "重试",

  // 演示模式横幅（DemoBar.tsx）
  "common.demo.message": "你正在浏览演示数据",
  "common.demo.startFresh": "重新开始",

  // 离线横幅（OfflineIndicator.tsx）
  "common.offline.title": "当前离线",
  "common.offline.description": "恢复网络后将自动同步更改",

  // 根布局崩溃边界（app/global-error.tsx）
  "common.globalError.title": "Kagelin 加载失败",
  "common.globalError.description":
    "应用启动前出现错误。请尝试重新加载——你的数据是安全的。",
  "common.globalError.tryAgain": "重试",

  // 状态徽章
  "common.badge.preview": "预览版",
  "common.badge.beta": "测试版",

  // 共用颜色选择器（shared/ColorPicker.tsx）
  "common.colorPicker.label": "颜色",
  "common.colorPicker.selectAria": "选择颜色",

  // 日期时间向导（ui/date-time-wizard.tsx）
  "common.dateWizard.date": "日期",
  "common.dateWizard.time": "时间",
  "common.dateWizard.today": "今天",
  "common.dateWizard.tomorrow": "明天",
  "common.dateWizard.evening": "晚上",
  "common.dateWizard.morning": "早上",
  "common.dateWizard.afternoon": "下午",
  "common.dateWizard.night": "夜里",
  "common.dateWizard.done": "完成",
  "common.dateWizard.setTimeFor": (params: TranslationParams) =>
    `设置时间：${params.date}`,

  // 应用级提示（hooks/useWeeklyBackup.ts）
  "common.backup.downloaded": "备份已下载",
  "common.backup.createFailed": "创建备份失败",
  "common.backup.reminder": "距离上次备份已有一段时间——立即备份，以免数据丢失",
  "common.backup.backUpNow": "立即备份",

  // 应用级提示（hooks/useAccountData.ts）
  "common.account.loginRequiredExport": "请先登录再导出云端数据",
  "common.account.loginRequiredImport": "请先登录再导入云端数据",
  "common.account.exportPreparing": "正在准备数据导出…",
  "common.account.exportSuccess": "数据导出成功",
  "common.account.exportFailed": (params: TranslationParams) =>
    `导出失败：${params.message}`,
  "common.account.importing": "正在导入云端数据…",
  "common.account.importSuccess": "数据导入成功。请刷新页面查看更改。",
  "common.account.importFailed": (params: TranslationParams) =>
    `导入失败：${params.message}`,
  "common.account.invalidBackup": "备份文件格式无效：缺少必要数据",
  "common.account.clearing": "正在清除云端数据…",
  "common.account.clearSuccess": "云端数据已清除",
  "common.account.clearFailed": (params: TranslationParams) =>
    `清除失败：${params.message}`,

  // 画中画窗口标题（hooks/useDocumentPiP.ts）
  "common.pip.focusTimer": "专注计时器",

  // 事件标题兜底（utils/nlp-event.ts）
  "common.untitledEvent": "未命名事件",
} satisfies Record<string, DictionaryValue>;
