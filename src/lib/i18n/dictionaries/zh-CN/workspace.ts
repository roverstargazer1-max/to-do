import type { DictionaryValue, TranslationParams } from "../../types";

/**
 * zh-CN `workspace` module — mirrors `dictionaries/en/workspace.ts`
 * exactly (enforced by the `Dictionary` type at the locale index).
 *
 * Verbatim glossary: Workspace → 工作台, Node → 节点, Task → 任务,
 * Habit → 习惯, Event → 事件, Focus → 专注.
 */
export const workspace = {
  // --- List page ---
  "workspace.list.title": "工作台",
  "workspace.list.description": "存放任务、习惯和事件引用的画布。",
  "workspace.list.newWorkspace": "新建工作台",
  "workspace.list.new": "新建",
  "workspace.list.openCanvas": "打开画布",
  "workspace.list.emptyTitle": "还没有工作台",
  "workspace.list.emptyDescription":
    "创建一个画布，然后以节点的形式把任务、习惯和事件放上去。",
  "workspace.list.createWorkspace": "创建工作台",
  "workspace.list.signupLayoutNote":
    "从访客模式登录：你的任务和习惯已迁移，但工作台画布仅保存在本设备，不会同步过来。",

  // --- Canvas page ---
  "workspace.canvas.notFoundTitle": "未找到工作台",
  "workspace.canvas.notFoundDescription": "它可能已在本设备上被删除。",
  "workspace.canvas.backToWorkspaces": "返回工作台",

  // --- Canvas chrome ---
  "workspace.canvas.add": "添加",
  "workspace.canvas.addTask": "任务",
  "workspace.canvas.addHabit": "习惯",
  "workspace.canvas.addEvent": "事件",
  "workspace.canvas.addFocus": "专注",
  "workspace.canvas.focusAdded": "专注节点已添加到画布",
  "workspace.canvas.focusAddFailed": "添加专注节点到画布失败",

  // --- Add-node pickers ---
  "workspace.addTask.title": "添加任务到画布",
  "workspace.addTask.description":
    "把任务放为节点——一个可以直接完成的实时引用，无需离开画布。",
  "workspace.addTask.emptyTitle": "没有可放置的任务",
  "workspace.addTask.emptyDescription": "请先创建任务——画布存放的是引用。",
  "workspace.addTask.added": "任务已添加到画布",
  "workspace.addTask.addFailed": "添加任务到画布失败",
  "workspace.addHabit.title": "添加习惯到画布",
  "workspace.addHabit.description":
    "把习惯放为节点——在画布上直接查看当日状态并打卡。",
  "workspace.addHabit.emptyTitle": "没有可放置的习惯",
  "workspace.addHabit.emptyDescription": "请先创建习惯——画布存放的是引用。",
  "workspace.addHabit.added": "习惯已添加到画布",
  "workspace.addHabit.addFailed": "添加习惯到画布失败",
  "workspace.addEvent.title": "添加事件到画布",
  "workspace.addEvent.description":
    "把日历事件放为只读节点——作为锚定布局的截止时间或日程。",
  "workspace.addEvent.emptyTitle": "没有可放置的事件",
  "workspace.addEvent.emptyDescription": "请先创建事件——画布存放的是引用。",
  "workspace.addEvent.added": "事件已添加到画布",
  "workspace.addEvent.addFailed": "添加事件到画布失败",

  // --- Nodes (shared) ---
  "workspace.node.removeFailed": "移除节点失败",
  "workspace.node.removeTaskAria": "移除任务节点",
  "workspace.node.toggleTaskAria": "从节点切换任务",
  "workspace.node.removeHabitAria": "移除习惯节点",
  "workspace.node.checkInHabitAria": "从节点打卡习惯",
  "workspace.node.removeEventAria": "移除事件节点",
  "workspace.node.removeFocusAria": "移除专注节点",
  "workspace.node.removeUnknownAria": "移除未知节点",
  "workspace.node.doneToday": "今日已完成",
  "workspace.node.today": "今天",
  "workspace.node.streak": (params: TranslationParams) =>
    `连续 ${params.count}`,
  "workspace.node.allDay": "全天",

  // --- Focus node ---
  "workspace.focusNode.modeFocus": "专注",
  "workspace.focusNode.modeShortBreak": "短休息",
  "workspace.focusNode.modeLongBreak": "长休息",
  "workspace.focusNode.pauseAria": "暂停计时器",
  "workspace.focusNode.startAria": "开始计时器",
  "workspace.focusNode.stopAria": "停止计时器",
  "workspace.focusNode.session": (params: TranslationParams) =>
    `第 ${params.number} 轮`,

  // --- Orphan body ---
  "workspace.orphan.body": (params: TranslationParams) =>
    `${params.label}已删除——此节点已孤立。`,
  "workspace.orphan.hint": "移除后节点消失，其他内容不受影响。",

  // --- Unknown node ---
  "workspace.unknown.body": (params: TranslationParams) =>
    `不支持的节点（${params.kind}）`,
  "workspace.unknown.hint": "此节点类型来自更新版本的应用，可以将其移除。",

  // --- CRUD dialogs ---
  "workspace.dialog.createTitle": "创建工作台",
  "workspace.dialog.createPlaceholder": "本周计划、全局蓝图、第 14 个冲刺…",
  "workspace.dialog.renameTitle": "重命名工作台",
  "workspace.dialog.renamePlaceholder": "工作台名称",
  "workspace.dialog.nameAria": "工作台名称",
  "workspace.dialog.nameDescription": "为你的工作台画布命名。",
  "workspace.dialog.deleteTitle": "删除工作台",
  "workspace.dialog.deleteDescription": (params: TranslationParams) =>
    `确定要删除“${params.name}”吗？它的节点会一并移除，但你的任务和习惯不受影响。`,
  "workspace.dialog.delete": "删除",
  "workspace.dialog.created": "工作台已创建",
  "workspace.dialog.createFailed": "创建工作台失败",
  "workspace.dialog.renamed": "工作台已重命名",
  "workspace.dialog.renameFailed": "重命名工作台失败",
  "workspace.dialog.deleted": "工作台已删除",
  "workspace.dialog.deleteFailed": "删除工作台失败",
} satisfies Record<string, DictionaryValue>;
