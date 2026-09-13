import type { DictionaryValue, TranslationParams } from "../../types";

/**
 * English `workspace` module (ticket 08): the canvas feature's full
 * surface — list page, canvas chrome, the five node kinds, orphan
 * placeholder, add-node pickers, and the workspace CRUD dialogs.
 *
 * Terminology is verbatim from the spec's starter table: Workspace is
 * the canvas surface (工作台), Node is one placed reference (节点).
 * CONTEXT.md's vocabulary (Orphan, viewport) informs the copy but only
 * user-visible words appear here.
 */
export const workspace = {
  // --- List page (app/workspaces/page.tsx) ---
  "workspace.list.title": "Workspaces",
  "workspace.list.description":
    "Canvases that hold references to your tasks, habits and events.",
  "workspace.list.newWorkspace": "New Workspace",
  "workspace.list.new": "New",
  "workspace.list.openCanvas": "Open canvas",
  "workspace.list.emptyTitle": "No workspaces yet",
  "workspace.list.emptyDescription":
    "Create a canvas, then drop tasks, habits and events onto it as nodes.",
  "workspace.list.createWorkspace": "Create Workspace",
  "workspace.list.signupLayoutNote":
    "Signed in from Guest mode: your tasks and habits migrated, but workspace canvases are device-local and don't carry over.",

  // --- Canvas page (app/workspaces/[id]/page.tsx) ---
  "workspace.canvas.notFoundTitle": "Workspace not found",
  "workspace.canvas.notFoundDescription":
    "It may have been deleted on this device.",
  "workspace.canvas.backToWorkspaces": "Back to Workspaces",

  // --- Canvas chrome (WorkspaceCanvas.tsx) ---
  "workspace.canvas.add": "Add",
  "workspace.canvas.addTask": "Task",
  "workspace.canvas.addHabit": "Habit",
  "workspace.canvas.addEvent": "Event",
  "workspace.canvas.addFocus": "Focus",
  "workspace.canvas.focusAdded": "Focus node added to canvas",
  "workspace.canvas.focusAddFailed": "Failed to add focus node to canvas",
  "workspace.canvas.addDoc": "Doc",
  "workspace.canvas.docAdded": "Doc node added to canvas",
  "workspace.canvas.docAddFailed": "Failed to add doc node to canvas",
  "workspace.canvas.connectFailed": "Failed to connect the nodes",
  "workspace.canvas.disconnect": "Disconnect",
  "workspace.canvas.disconnectFailed": "Failed to remove the connection",
  "workspace.canvas.quickTaskPlaceholder":
    "New task title, press Enter to create...",
  "workspace.canvas.pickExistingTask": "Select existing task",
  "workspace.canvas.pickExistingProject": "Select existing project",
  "workspace.canvas.fitView": "Fit view",
  "workspace.canvas.taskCreated": "Task created and added to canvas",
  "workspace.canvas.taskCreateFailed": "Failed to create task",

  // --- Add-node pickers (AddTaskNodeDialog / AddHabitNodeDialog / AddEventNodeDialog) ---
  "workspace.addTask.title": "Add task to canvas",
  "workspace.addTask.description":
    "Place a task as a node — a live reference you can complete without leaving the canvas.",
  "workspace.addTask.emptyTitle": "No tasks to place",
  "workspace.addTask.emptyDescription":
    "Create a task first — the canvas holds references.",
  "workspace.addTask.added": "Task added to canvas",
  "workspace.addTask.addFailed": "Failed to add task to canvas",
  "workspace.addHabit.title": "Add habit to canvas",
  "workspace.addHabit.description":
    "Place a habit as a node — its live daily state and check-in, without leaving the canvas.",
  "workspace.addHabit.emptyTitle": "No habits to place",
  "workspace.addHabit.emptyDescription":
    "Create a habit first — the canvas holds references.",
  "workspace.addHabit.added": "Habit added to canvas",
  "workspace.addHabit.addFailed": "Failed to add habit to canvas",
  "workspace.addEvent.title": "Add event to canvas",
  "workspace.addEvent.description":
    "Place a calendar event as a display-only node — a deadline or appointment to anchor the arrangement.",
  "workspace.addEvent.emptyTitle": "No events to place",
  "workspace.addEvent.emptyDescription":
    "Create an event first — the canvas holds references.",
  "workspace.addEvent.added": "Event added to canvas",
  "workspace.addEvent.addFailed": "Failed to add event to canvas",
  "workspace.addProject.title": "Add project to canvas",
  "workspace.addProject.description":
    "Place a project as a node — view live progress and active tasks without leaving the canvas.",
  "workspace.addProject.emptyTitle": "No projects to place",
  "workspace.addProject.emptyDescription":
    "Create a project first — the canvas holds references.",
  "workspace.addProject.added": "Project added to canvas",
  "workspace.addProject.addFailed": "Failed to add project to canvas",

  // --- Nodes (shared) ---
  "workspace.node.removeFailed": "Failed to remove node",
  "workspace.node.removeTaskAria": "Remove task node",
  "workspace.node.toggleTaskAria": "Toggle task from node",
  "workspace.node.removeHabitAria": "Remove habit node",
  "workspace.node.checkInHabitAria": "Check in habit from node",
  "workspace.node.removeEventAria": "Remove event node",
  "workspace.node.removeFocusAria": "Remove focus node",
  "workspace.node.removeDocAria": "Remove doc node",
  "workspace.node.removeProjectAria": "Remove project node",
  "workspace.node.removeUnknownAria": "Remove unknown node",
  // Habit node state labels (habits.ts owns the page's equivalents; the
  // node reuses the same words in its own namespace).
  "workspace.node.doneToday": "Done today",
  "workspace.node.today": "Today",
  "workspace.node.streak": (params: TranslationParams) =>
    `${params.count} streak`,
  // Event node's all-day marker.
  "workspace.node.allDay": "All day",
  // The card head's kind label (NodeCard.tsx) — uppercased by CSS.
  "workspace.node.kindTask": "Task",
  "workspace.node.kindHabit": "Habit",
  "workspace.node.kindEvent": "Event",
  "workspace.node.kindFocus": "Focus",
  "workspace.node.kindDoc": "Doc",
  "workspace.node.kindProject": "Project",
  "workspace.node.kindUnknown": "Unknown",

  // --- Doc node (DocNode.tsx) ---
  "workspace.docNode.placeholder": "Enter prompt or Markdown content...",
  "workspace.docNode.emptyPreview": "Double-click to edit content...",
  "workspace.docNode.copySuccess": "Copied to clipboard",
  "workspace.docNode.copyFailed": "Failed to copy to clipboard",
  "workspace.docNode.copyAria": "Copy content",
  "workspace.docNode.editAria": "Edit content",
  "workspace.docNode.previewAria": "Done and preview",
  "workspace.docNode.titlePlaceholder": "Doc title",

  // --- Focus node (FocusNode.tsx) ---
  "workspace.focusNode.modeFocus": "Focus",
  "workspace.focusNode.modeShortBreak": "Short Break",
  "workspace.focusNode.modeLongBreak": "Long Break",
  "workspace.focusNode.pauseAria": "Pause timer",
  "workspace.focusNode.startAria": "Start timer",
  "workspace.focusNode.stopAria": "Stop timer",
  "workspace.focusNode.session": (params: TranslationParams) =>
    `Session ${params.number}`,

  // --- Project node (ProjectNode.tsx) ---
  "workspace.project.noTasks": "No active tasks",
  "workspace.project.allCompleted": "All tasks completed",
  "workspace.project.completedRatio": (params: TranslationParams) =>
    `${params.completed}/${params.total} completed (${params.percent}%)`,
  "workspace.project.viewMoreTasks": (params: TranslationParams) =>
    `View ${params.count} more tasks →`,
  "workspace.project.openProject": "Open project view",
  "workspace.project.activeTaskCount": (params: TranslationParams) =>
    `${params.count} active`,

  // --- Orphan body (NodeOrphanBody.tsx) ---
  "workspace.orphan.body": (params: TranslationParams) =>
    `${params.label} deleted — this node is orphaned.`,
  "workspace.orphan.hint": "Dismiss removes the node; nothing else changes.",

  // --- Unknown node (UnknownNode.tsx) ---
  "workspace.unknown.body": (params: TranslationParams) =>
    `Unsupported node (${params.kind})`,
  "workspace.unknown.hint":
    "This node type comes from a newer version. It can be removed.",

  // --- CRUD dialogs (WorkspaceDialogs.tsx) ---
  "workspace.dialog.createTitle": "Create Workspace",
  "workspace.dialog.createPlaceholder": "Week Plan, Big Picture, Sprint 14...",
  "workspace.dialog.renameTitle": "Rename Workspace",
  "workspace.dialog.renamePlaceholder": "Workspace name",
  "workspace.dialog.nameAria": "Workspace Name",
  "workspace.dialog.nameDescription": "Name your workspace canvas.",
  "workspace.dialog.colorLabel": "Workspace color",
  "workspace.dialog.deleteTitle": "Delete Workspace",
  "workspace.dialog.deleteDescription": (params: TranslationParams) =>
    `Are you sure you want to delete "${params.name}"? Its nodes are removed with it; your tasks and habits are not affected.`,
  "workspace.dialog.delete": "Delete",
  "workspace.dialog.created": "Workspace created",
  "workspace.dialog.createFailed": "Failed to create workspace",
  "workspace.dialog.renamed": "Workspace renamed",
  "workspace.dialog.renameFailed": "Failed to rename workspace",
  "workspace.dialog.deleted": "Workspace deleted",
  "workspace.dialog.deleteFailed": "Failed to delete workspace",

  // --- Grouping ---
  "workspace.toolbar.group": "Group",
  "workspace.toolbar.ungroup": "Ungroup",
  "workspace.group.defaultTitle": "Group",
  "workspace.group.renameHint": "Double click to rename",
  "workspace.group.renameFailed": "Failed to rename group",
  "workspace.group.ungrouped": "Group dissolved",
  "workspace.group.ungroupFailed": "Failed to ungroup",
  "workspace.group.createFailed": "Failed to create group",
} satisfies Record<string, DictionaryValue>;
