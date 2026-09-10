import type { DictionaryValue } from "../../types";

/**
 * zh-CN `shortcuts` module — mirrors `dictionaries/en/shortcuts.ts`
 * exactly. Key names (j/k/g/G…) are never localized.
 */
export const shortcuts = {
  "shortcuts.title": "键盘快捷键",
  "shortcuts.subtitle": "用 Kagelin 打磨你的工作流",

  "shortcuts.groupNavigation": "导航",
  "shortcuts.groupActions": "操作",
  "shortcuts.groupView": "视图",
  "shortcuts.groupVim": "任务列表（Vim）",

  "shortcuts.goToTasks": "前往任务",
  "shortcuts.goToHabits": "前往习惯",
  "shortcuts.goToCalendar": "前往日历",
  "shortcuts.goToStats": "前往统计",
  "shortcuts.goToFocus": "前往专注",
  "shortcuts.goToSettings": "前往设置",
  "shortcuts.toggleSidebar": "切换侧边栏",
  "shortcuts.closeFocusDialogs": "关闭专注/对话框",
  "shortcuts.newTask": "新建任务",
  "shortcuts.createHabit": "创建习惯",
  "shortcuts.newEvent": "新建事件",
  "shortcuts.newProject": "新建项目",
  "shortcuts.newWorkspace": "新建工作台",
  "shortcuts.archivedProjects": "已归档项目",
  "shortcuts.toggleCompleted": "切换已完成任务",
  "shortcuts.saveTask": "保存任务",
  "shortcuts.searchCommandMenu": "搜索 / 命令菜单",
  "shortcuts.switchTheme": "切换主题",
  "shortcuts.focusMode": "专注模式",
  "shortcuts.showShortcuts": "显示快捷键",
  "shortcuts.listView": "列表视图",
  "shortcuts.boardView": "看板视图",
  "shortcuts.selectNextTask": "选择下一个任务",
  "shortcuts.selectPreviousTask": "选择上一个任务",
  "shortcuts.selectColumnLeft": "选择左列（看板）",
  "shortcuts.selectColumnRight": "选择右列（看板）",
  "shortcuts.jumpToFirstTask": "跳到第一个任务",
  "shortcuts.jumpToLastTask": "跳到最后一个任务",
  "shortcuts.openSelected": "打开选中项",
  "shortcuts.toggleCompletion": "切换完成状态",
  "shortcuts.deleteSelected": "删除选中项",
  "shortcuts.undo": "撤销",
  "shortcuts.yankSelectedTask": "复制选中任务",
  "shortcuts.pasteYankedTask": "粘贴已复制任务",
  "shortcuts.clearSelection": "清除选择",
} satisfies Record<string, DictionaryValue>;
