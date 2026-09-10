import type { DictionaryValue } from "../../types";

/**
 * zh-CN `command` module — mirrors `dictionaries/en/command.ts` exactly.
 */
export const command = {
  "command.title": "命令菜单",
  "command.subtitle": "快捷操作与导航",
  "command.searchPlaceholder": "输入命令或搜索…",
  "command.emptyTitle": "未找到结果",
  "command.emptyDescription": "换个关键词试试。",

  "command.groupActions": "操作",
  "command.groupTasks": "任务",
  "command.groupHabits": "习惯",
  "command.groupEvents": "事件",
  "command.groupFocus": "专注时段",
  "command.groupView": "视图选项",
  "command.groupNavigation": "导航",
  "command.groupAccount": "账户",

  "command.newTask": "新建任务",
  "command.newHabit": "新建习惯",
  "command.newEvent": "新建事件",
  "command.newProject": "新建项目",
  "command.newWorkspace": "新建工作台",
  "command.archivedProjects": "已归档项目",
  "command.showCompleted": "显示已完成任务",
  "command.syncNow": "立即同步",
  "command.syncing": "同步中…",
  "command.openPip": "打开画中画窗口",
  "command.closePip": "关闭画中画窗口",
  "command.toggleSidebar": "切换侧边栏",
  "command.pomodoro": "番茄钟（25 分钟）",
  "command.deepWork": "深度工作（50 分钟）",
  "command.focusSession": "专注时段",
  "command.sortByDate": "按日期排序",
  "command.sortByPriority": "按优先级排序",
  "command.groupByProject": "按项目分组",
  "command.ungroupTasks": "取消任务分组",
  "command.toggleDarkMode": "切换深色模式",
  "command.keyboardShortcuts": "键盘快捷键",
  "command.copyUserId": "复制我的用户 ID",
  "command.signOut": "退出登录",
} satisfies Record<string, DictionaryValue>;
