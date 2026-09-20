import type { DictionaryValue, TranslationParams } from "../../types";

/**
 * zh-CN `settings` module — mirrors `dictionaries/en/settings.ts` exactly
 * (enforced by the `Dictionary` type at the locale index).
 *
 * Verbatim glossary: Kagelin is never translated; Task → 任务,
 * Habit → 习惯, Focus → 专注, Stats → 统计, Calendar → 日历.
 */
export const settings = {
  // --- Page chrome ---
  "settings.title": "设置",
  "settings.subtitle": "管理你的账户和偏好设置",
  "settings.back": "返回",
  "settings.tab.appearance": "外观",
  "settings.tab.preferences": "偏好设置",
  "settings.tab.account": "账户",
  "settings.signingOut": "正在退出登录…",
  "settings.about": "关于",

  // --- Appearance ---
  "settings.appearance.title": "外观",
  "settings.appearance.theme": "主题",
  "settings.appearance.themeLight": "浅色",
  "settings.appearance.themeDark": "深色",
  "settings.appearance.themeSystem": "跟随系统",

  // --- Preferences ---
  "settings.preferences.title": "偏好设置",
  "settings.language.label": "语言",
  "settings.language.description": "选择界面显示语言",
  "settings.haptics.label": "触感反馈",
  "settings.haptics.description": "交互时振动",
  "settings.timeFormat.label": "时间格式",
  "settings.timeFormat.description": "选择时间的显示方式",
  "settings.timeFormat.12h": "12 小时",
  "settings.timeFormat.24h": "24 小时",
  "settings.timeFormat.system": "跟随系统",

  // --- Goals ---
  "settings.goals.title": "目标",
  "settings.goals.label": "目标",
  "settings.goals.description":
    "在统计页以圆环显示每日和每周目标。留空则隐藏对应的圆环。",
  "settings.goals.dailyFocusHours": "每日专注时长",
  "settings.goals.weeklyFocusHours": "每周专注时长",
  "settings.goals.dailyTasksCompleted": "每日完成任务数",
  "settings.goals.weeklyTasksCompleted": "每周完成任务数",
  "settings.goals.off": "关闭",

  // --- Guest mode ---
  "settings.guest.title": "访客模式",
  "settings.guest.description":
    "你的数据保存在浏览器本地。登录后可在多设备间同步数据，确保不会丢失。",
  "settings.guest.syncToAccount": "同步到账户",
  "settings.guest.resetDemo": "重置演示数据",
  "settings.guest.clearData": "清除数据",

  // --- Account ---
  "settings.account.title": "账户",
  "settings.account.name": "姓名",
  "settings.account.email": "邮箱",
  "settings.account.notSignedIn": "未登录",
  "settings.account.deleteCloudData": "删除云端数据",
  "settings.account.signOut": "退出登录",

  // --- Account section ---
  "settings.account.providers.title": "已连接的登录方式",
  "settings.account.providers.description": "管理已连接到账户的登录方式。",
  "settings.account.providers.email": "邮箱",
  "settings.account.providers.connected": "已连接",
  "settings.account.providers.notConnected": "未连接",
  "settings.account.providers.connect": "连接",
  "settings.account.providers.connecting": "正在连接…",
  "settings.account.providers.disconnect": "断开连接",
  "settings.account.providers.disconnecting": "正在断开…",
  "settings.account.providers.connectAria": (params: TranslationParams) =>
    `连接 ${params.provider}`,
  "settings.account.providers.disconnectAria": (params: TranslationParams) =>
    `断开 ${params.provider}`,
  "settings.account.providers.disconnectFailed": "断开登录方式失败",
  "settings.account.providers.disconnected": (params: TranslationParams) =>
    `已断开 ${params.provider}`,
  "settings.account.password.setTitle": "设置密码",
  "settings.account.password.changeTitle": "修改密码",
  "settings.account.password.setDescription":
    "设置密码后即可使用邮箱和密码登录账户。",
  "settings.account.password.changeDescription": "更新你当前的账户密码。",
  "settings.account.password.newPassword": "新密码",
  "settings.account.password.tooShort": (params: TranslationParams) =>
    `密码至少需要 ${params.min} 个字符。`,
  "settings.account.password.verificationCode": "验证码",
  "settings.account.password.codePlaceholder": "输入邮件中的验证码",
  "settings.account.password.reauthNotice":
    "为保障安全，我们已向你的邮箱发送验证码以确认此次修改。",
  "settings.account.password.resend": "重新发送验证码",
  "settings.account.password.resending": "正在发送…",
  "settings.account.password.contactSupport": "联系客服",
  "settings.account.password.set": "设置密码",
  "settings.account.password.change": "修改密码",
  "settings.account.password.setting": "正在设置…",
  "settings.account.password.updating": "正在更新…",
  "settings.account.password.confirming": "正在确认…",
  "settings.account.password.confirmChange": "确认修改密码",
  "settings.account.password.setSuccess": "密码设置成功",
  "settings.account.password.changeSuccess": "密码修改成功",
  "settings.account.password.invalidCode": "验证码不正确，请检查邮箱后重试。",
  "settings.account.password.updateFailed": "更新密码失败",
  "settings.account.password.codeSendFailed": "发送验证码失败",
  "settings.account.password.codeResent": "验证码已重新发送",

  // --- Notifications ---
  "settings.notifications.unsupported.title": "不支持通知",
  "settings.notifications.unsupported.description": "你的浏览器不支持推送通知",
  "settings.notifications.ios.title": "将 Kagelin 添加到主屏幕即可开启通知",
  "settings.notifications.ios.description":
    "点按“分享”，然后选择“添加到主屏幕”。",
  "settings.notifications.push.title": "推送通知",
  "settings.notifications.push.guestHint": "登录后即可开启通知",
  "settings.notifications.push.grantedHint": "接收更新和提醒",
  "settings.notifications.push.enableHint": "开启以接收更新",
  "settings.notifications.push.guestTooltip": "仅对注册用户可用",
  "settings.notifications.sendTest": "发送测试通知（服务端）",
  "settings.notifications.triggerLocal": "触发本地通知（自检）",
  "settings.notifications.androidLate": "Android 上通知延迟到达？",
  "settings.notifications.localTime.title": "本地时间",
  "settings.notifications.localTime.description":
    "确认你的时区，确保早间简报和任务提醒在正确的本地时间送达。",
  "settings.notifications.timezone.select": "选择时区",
  "settings.notifications.timezone.search": "搜索时区",
  "settings.notifications.timezone.searchPlaceholder": "搜索时区…",
  "settings.notifications.timezone.empty": "未找到时区",
  "settings.notifications.schedules.title": "定时提醒",
  "settings.notifications.schedules.morningTitle": "早间简报",
  "settings.notifications.schedules.morningDescription":
    "每天上午 8:00 发送摘要",
  "settings.notifications.schedules.eveningTitle": "晚间计划",
  "settings.notifications.schedules.eveningDescription":
    "下午 6:00 回顾今晚的任务",
  "settings.notifications.schedules.dueTitle": "截止日期提醒",
  "settings.notifications.schedules.dueDescription": "当任务到达截止时间时",
  "settings.notifications.schedules.timerTitle": "计时结束提醒",
  "settings.notifications.schedules.timerDescription": "当专注或休息结束时",
  "settings.notifications.toast.unsupported": "此浏览器不支持推送通知",
  "settings.notifications.toast.enabled": "通知已开启",
  "settings.notifications.toast.denied": "权限被拒绝。请在浏览器设置中开启。",
  "settings.notifications.toast.activateFailed": "在此设备上开启通知失败。",
  "settings.notifications.toast.disabled": "通知已关闭",
  "settings.notifications.toast.updateFailed": "更新设置失败",
  "settings.notifications.toast.enableFirst": "请先开启通知",
  "settings.notifications.toast.refreshFailed": "在此设备上刷新通知失败",
  "settings.notifications.toast.testSent": "测试通知已发送到本设备",
  "settings.notifications.toast.testFailed": "发送测试通知失败",
  "settings.notifications.toast.localTriggered": "已触发本地通知",
  "settings.notifications.test.title": "测试通知",
  "settings.notifications.test.body": "这是来自 Kagelin 的服务端测试通知",
  "settings.notifications.test.localTitle": "本地测试通知",
  "settings.notifications.test.localBody": "此通知由浏览器在本地触发。",

  // --- Android battery hint ---
  "settings.androidBattery.title": "Android 上通知可能延迟到达。",
  "settings.androidBattery.body":
    "需要将 Chrome 的电池优化设为“不受限制”，推送才能在锁屏空闲时可靠唤醒它——这是 Chrome 的设置，而非 Kagelin 的（已安装的 Android 网页应用没有自己的进程）。请前往",
  "settings.androidBattery.path": "设置 → 应用 → Chrome → 电池 → 不受限制",
  "settings.androidBattery.tail":
    "。在三星、小米、一加或 OPPO 手机上，此设置常被隐藏、改名，或叠加在厂商自带的后台清理之下——如果找不到，请在手机的“设置”中搜索“电池优化”。",
  "settings.androidBattery.dismiss": "关闭",

  // --- Backup & sync ---
  "settings.backup.exportedAtFormat": (params: TranslationParams) =>
    `${params.date} ${params.time}`,
  "settings.backup.tab.local": "本地存储",
  "settings.backup.tab.webdav": "WebDAV",
  "settings.backup.local.title": "本地备份",
  "settings.backup.local.descriptionGuest":
    "将你的本地数据导出为 ZIP 文件，或从备份中恢复。",
  "settings.backup.local.descriptionCloud":
    "将你的云端数据导出为 ZIP 文件，或从备份中恢复。",
  "settings.backup.export": "导出",
  "settings.backup.import": "导入",
  "settings.backup.importOtherApps": "从其他应用导入",
  "settings.backup.importFileAria": "导入备份文件",
  "settings.backup.webdav.title": "WebDAV 备份",
  "settings.backup.webdav.description":
    "在你自己的 WebDAV 服务器上保留一份副本。",
  "settings.backup.webdav.serverUrl": "服务器地址",
  "settings.backup.webdav.username": "用户名",
  "settings.backup.webdav.usernamePlaceholder": "名称",
  "settings.backup.webdav.password": "密码",
  "settings.backup.webdav.test": "测试连接",
  "settings.backup.webdav.forget": "清除凭据",
  "settings.backup.webdav.backUp": "备份",
  "settings.backup.webdav.restore": "恢复",
  "settings.backup.webdav.credentialsNote":
    "你的凭据仅用于本次会话——不会被保存，刷新后需要重新输入。",
  "settings.backup.reminders.title": "备份提醒",
  "settings.backup.reminders.description":
    "由于数据仅保存在本设备，我们会定期提醒你导出备份。",
  "settings.backup.reminders.toggleTitle": "提醒我备份",
  "settings.backup.reminders.toggleDescription": "定期提醒导出本地数据",
  "settings.backup.reminders.frequencyAria": "提醒频率",
  "settings.backup.reminders.frequencyPlaceholder": "频率",
  "settings.backup.reminders.weekly": "每周",
  "settings.backup.reminders.biweekly": "每两周",
  "settings.backup.reminders.monthly": "每月",
  "settings.backup.replace.title": "要替换你的数据吗？",
  "settings.backup.replace.descriptionWithDate": (params: TranslationParams) =>
    `此备份创建于 ${params.date}。恢复将用其覆盖账户中的所有内容——不在该备份中的数据都会丢失。此操作无法撤销。`,
  "settings.backup.replace.description":
    "恢复将用服务器上的备份覆盖账户中的所有内容。不在该备份中的数据都会丢失。此操作无法撤销。",
  "settings.backup.sqlite.title": "SQLite 数据库 (.db)",
  "settings.backup.sqlite.description":
    "创建即时 SQLite 数据库快照（零停机），或直接从 .db 文件恢复数据库。",
  "settings.backup.sqlite.snapshot": "创建数据库快照 (.db)",
  "settings.backup.sqlite.restore": "恢复数据库 (.db)",
  "settings.backup.sqlite.snapshotSuccess": "SQLite 快照下载成功",
  "settings.backup.sqlite.snapshotFailed": "创建 SQLite 快照失败",
  "settings.backup.sqlite.restoreSuccess": "SQLite 数据库恢复成功",
  "settings.backup.sqlite.restoreFailed": "恢复 SQLite 数据库失败",
  "settings.backup.sqlite.restoreConfirmTitle": "确认恢复 SQLite 数据库？",
  "settings.backup.sqlite.restoreConfirmDescription":
    "从 SQLite 文件恢复将完全替换当前的本地数据库并重新加载工作区。如果需要，请先创建当前数据库的快照备份。",
  "settings.backup.replace.confirm": "替换",
  "settings.backup.toast.exported": "备份下载成功",
  "settings.backup.toast.exportFailed": "创建备份失败",
  "settings.backup.toast.importing": (params: TranslationParams) =>
    `正在导入 ${params.name}…`,
  "settings.backup.toast.imported": (params: TranslationParams) =>
    `已恢复 ${params.tasks} 个任务、${params.projects} 个项目`,
  "settings.backup.toast.importFailed": "导入备份失败",
  "settings.backup.toast.credentialsCleared": "凭据已清除",
  "settings.backup.toast.fillAllFields": "请填写所有 WebDAV 字段",
  "settings.backup.toast.connected": "连接成功",
  "settings.backup.toast.connectionFailed": "连接失败",
  "settings.backup.toast.connectionTestFailed": "连接测试失败",
  "settings.backup.toast.configureFirst": "请先配置 WebDAV 设置",
  "settings.backup.toast.backedUp": "已备份到服务器",
  "settings.backup.toast.backUpFailed": "备份失败",
  "settings.backup.toast.downloadFailed": "下载失败",
  "settings.backup.toast.restored": "已从服务器恢复数据",
  "settings.backup.toast.restoreFailed": "恢复失败",

  // --- Import dialog ---
  "settings.import.title": "导入数据",
  "settings.import.description": "选择文件，将数据迁移到 Kagelin。",
  "settings.import.loopHabits": "Loop Habit Tracker",
  "settings.import.loopHabitsDescription": "从 .db 文件导入（Android）",
  "settings.import.loopHabitsSelectAria": "选择 Loop Habit Tracker 数据库文件",
  "settings.import.loopHabitsUploadAria": "上传 Loop Habit Tracker 数据库文件",
  "settings.import.ics": "ICS（日历）",
  "settings.import.icsDescription": "导入到日历",
  "settings.import.icsSelectAria": "选择 iCalendar ICS 文件",
  "settings.import.icsUploadAria": "上传 iCalendar ICS 文件",
  "settings.import.select": "选择",
  "settings.import.cancel": "取消",

  // --- Delete user data dialog ---
  "settings.deleteData.titleGuest": "删除全部数据",
  "settings.deleteData.titleCloud": "删除云端数据",
  "settings.deleteData.descriptionGuest":
    "此操作不可撤销。你本地所有的习惯、任务和设置将被永久删除。",
  "settings.deleteData.descriptionCloud":
    "此操作不可撤销。你所有的习惯、任务和云端设置将从服务器中永久删除。",
  "settings.deleteData.typePrompt": "输入",
  "settings.deleteData.typeWord": "delete",
  "settings.deleteData.typeSuffix": "以确认",
  "settings.deleteData.placeholder": "输入“delete”…",
  "settings.deleteData.confirm": "删除账户数据",
  "settings.deleteData.confirmMobile": "永久删除数据",
  "settings.deleteData.cancel": "取消",

  // --- Privacy ---
  "settings.privacy.title": "共享匿名遥测数据",
  "settings.privacy.description":
    "通过共享匿名使用数据（功能使用、计时时长、平台）帮助改进 Kagelin。我们绝不会收集或传输个人数据、任务标题和备注。请参阅我们的",

  // --- PWA install row ---
  "settings.pwa.addToHomeScreen": "添加到主屏幕",
  "settings.pwa.installApp": "安装应用",
  "settings.pwa.hide": "隐藏",
  "settings.pwa.showMeHow": "如何操作",
  "settings.pwa.install": "安装",
  "settings.pwa.iosHint": "点按“分享”图标，然后选择“添加到主屏幕”。",
  "settings.pwa.browserMenuHint": "使用浏览器菜单安装此应用。",

  // --- About sheet ---
  "settings.about.title": "关于 Kagelin",
  "settings.about.whatsNew": "新功能",
  "settings.about.whatsNewDetail": "最近的变更与发布",
  "settings.about.sourceVersion": (params: TranslationParams) =>
    `源码（v${params.version}）`,
  "settings.about.sourceVersionDetail": "GitHub 上的此精确构建",
  "settings.about.sourceCode": "源代码",
  "settings.about.reportIssue": "反馈问题",
  "settings.about.reportIssueDetail": "提交缺陷或功能请求",
  "settings.about.license": "许可证",
  "settings.about.privacyPolicy": "隐私政策",
  "settings.about.terms": "服务条款",
  "settings.about.oss": "开源软件",
  "settings.about.ossDetail": "完整依赖列表",
} satisfies Record<string, DictionaryValue>;
