import type { QueryClient } from "@tanstack/react-query";
import type {
  Workspace,
  WorkspaceEdge,
  WorkspaceNode,
  NodePosition,
} from "@/lib/types/workspace";
import type { Task, Project } from "@/lib/types/task";
import type { Habit } from "@/lib/types/habit";
import { workspaceMutations } from "@/lib/mutations/workspace";
import { mockStore } from "@/lib/mock/mock-store";
import { taskKeys } from "@/lib/queries/task-keys";

export interface DecompilerContext {
  queryClient?: QueryClient;
  isGuestMode?: boolean;
  workspace?: Workspace;
  nodes?: WorkspaceNode[];
  edges?: WorkspaceEdge[];
  getTask?: (
    taskId: string,
  ) => Promise<Task | null | undefined> | Task | null | undefined;
  getProject?: (
    projectId: string,
  ) => Promise<Project | null | undefined> | Project | null | undefined;
  getHabit?: (
    habitId: string,
  ) => Promise<Habit | null | undefined> | Habit | null | undefined;
}

export interface SnapshotItem {
  nodeId: string;
  kind: string;
  title?: string;
  content?: string;
  entityId?: string | null;
  entityType?: string | null;
  isCompleted?: boolean;
  priority?: number;
  dueDate?: string | null;
  projectName?: string | null;
  habitStreak?: number;
  color?: string;
  position: NodePosition;
  width?: number | null;
  height?: number | null;
  isOrphaned?: boolean;
}

export interface SnapshotGroup {
  groupId: string;
  title: string;
  color?: string;
  position: NodePosition;
  width?: number | null;
  height?: number | null;
  items: SnapshotItem[];
}

export interface SnapshotEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceTitle?: string;
  targetTitle?: string;
}

export interface WorkspaceSnapshot {
  workspaceId: string;
  name: string;
  color?: string | null;
  groups: SnapshotGroup[];
  standaloneItems: SnapshotItem[];
  edges: SnapshotEdge[];
  rawNodes?: WorkspaceNode[];
  rawEdges?: WorkspaceEdge[];
}

/**
 * Decompiles a workspace's raw nodes and edges into a structured semantic snapshot.
 */
export async function decompileWorkspaceToSnapshot(
  workspaceId: string,
  context: DecompilerContext = {},
): Promise<WorkspaceSnapshot> {
  const isGuest =
    context.isGuestMode ??
    (typeof window !== "undefined" &&
      localStorage.getItem("kanso_guest_mode") === "true");

  // 1. Fetch workspace row if not supplied
  let workspace = context.workspace;
  if (!workspace) {
    const list = await workspaceMutations.list();
    workspace = list.find((w) => w.id === workspaceId);
  }

  const workspaceName = workspace?.name ?? `Workspace (${workspaceId})`;
  const workspaceColor = workspace?.color ?? null;

  // 2. Fetch nodes and edges if not supplied
  const rawNodes =
    context.nodes ?? (await workspaceMutations.listNodes(workspaceId));
  const rawEdges =
    context.edges ?? (await workspaceMutations.listEdges(workspaceId));

  // Entity resolvers
  const resolveTask = async (taskId: string): Promise<Task | null> => {
    if (context.getTask) {
      const res = await context.getTask(taskId);
      return res ?? null;
    }
    if (context.queryClient) {
      const cached = context.queryClient.getQueryData<Task[]>(taskKeys.all);
      const found = cached?.find((t) => t.id === taskId);
      if (found) return found;
    }
    if (isGuest) {
      const tasks = mockStore.getTasks();
      return tasks.find((t) => t.id === taskId) ?? null;
    }
    return null;
  };

  const resolveProject = async (projectId: string): Promise<Project | null> => {
    if (context.getProject) {
      const res = await context.getProject(projectId);
      return res ?? null;
    }
    if (context.queryClient) {
      const cached = context.queryClient.getQueryData<Project[]>(["projects"]);
      const found = cached?.find((p) => p.id === projectId);
      if (found) return found;
    }
    if (isGuest) {
      const projects = mockStore.getProjects();
      return projects.find((p) => p.id === projectId) ?? null;
    }
    return null;
  };

  const resolveHabit = async (habitId: string): Promise<Habit | null> => {
    if (context.getHabit) {
      const res = await context.getHabit(habitId);
      return res ?? null;
    }
    if (context.queryClient) {
      const cached = context.queryClient.getQueryData<Habit[]>(["habits"]);
      const found = cached?.find((h) => h.id === habitId);
      if (found) return found;
    }
    if (isGuest) {
      const habits = mockStore.getHabits();
      return habits.find((h) => h.id === habitId) ?? null;
    }
    return null;
  };

  // 3. Build group map and categorize nodes
  const groupNodes = rawNodes.filter((n) => n.kind === "group");
  const memberNodes = rawNodes.filter((n) => n.kind !== "group");

  const groupsById = new Map<string, SnapshotGroup>();
  for (const g of groupNodes) {
    const display = (g.display_config ?? {}) as {
      title?: string;
      color?: string;
    };
    groupsById.set(g.id, {
      groupId: g.id,
      title: display.title || "Group",
      color: display.color,
      position: { x: g.position_x, y: g.position_y },
      width: g.width,
      height: g.height,
      items: [],
    });
  }

  const nodeTitleMap = new Map<string, string>();
  const standaloneItems: SnapshotItem[] = [];

  for (const n of memberNodes) {
    const display = (n.display_config ?? {}) as Record<string, unknown>;
    const item: SnapshotItem = {
      nodeId: n.id,
      kind: n.kind,
      position: { x: n.position_x, y: n.position_y },
      width: n.width,
      height: n.height,
      entityId: n.entity_id,
      entityType: n.entity_type,
    };

    if (n.kind === "doc") {
      item.title = (display.title as string) || "Untitled Document";
      item.content = (display.content as string) || "";
      item.color = (display.color as string) || undefined;
      nodeTitleMap.set(n.id, item.title);
    } else if (n.kind === "task") {
      if (n.entity_id) {
        const task = await resolveTask(n.entity_id);
        if (task) {
          item.title = task.content;
          item.isCompleted = task.is_completed;
          item.priority = task.priority;
          item.dueDate = task.due_date;
          if (task.project_id) {
            const project = await resolveProject(task.project_id);
            item.projectName = project?.name ?? null;
          }
          nodeTitleMap.set(n.id, item.title);
        } else {
          item.isOrphaned = true;
          item.title = "[Deleted Task]";
          nodeTitleMap.set(n.id, item.title);
        }
      } else {
        item.title = "[Empty Task]";
        nodeTitleMap.set(n.id, item.title);
      }
    } else if (n.kind === "habit") {
      if (n.entity_id) {
        const habit = await resolveHabit(n.entity_id);
        if (habit) {
          item.title = habit.name;
          item.color = habit.color;
          nodeTitleMap.set(n.id, item.title);
        } else {
          item.isOrphaned = true;
          item.title = "[Deleted Habit]";
          nodeTitleMap.set(n.id, item.title);
        }
      } else {
        item.title = "[Empty Habit]";
        nodeTitleMap.set(n.id, item.title);
      }
    } else if (n.kind === "project") {
      if (n.entity_id) {
        const project = await resolveProject(n.entity_id);
        if (project) {
          item.title = project.name;
          item.color = project.color;
          nodeTitleMap.set(n.id, item.title);
        } else {
          item.isOrphaned = true;
          item.title = "[Deleted Project]";
          nodeTitleMap.set(n.id, item.title);
        }
      } else {
        item.title = "[Empty Project]";
        nodeTitleMap.set(n.id, item.title);
      }
    } else if (n.kind === "focus") {
      item.title = "Focus Timer";
      nodeTitleMap.set(n.id, item.title);
    } else {
      item.title = (display.title as string) || `${n.kind} node`;
      nodeTitleMap.set(n.id, item.title);
    }

    if (n.group_id && groupsById.has(n.group_id)) {
      groupsById.get(n.group_id)!.items.push(item);
    } else {
      standaloneItems.push(item);
    }
  }

  // 4. Build edges
  const edges: SnapshotEdge[] = rawEdges.map((e) => ({
    id: e.id,
    sourceNodeId: e.source_node_id,
    targetNodeId: e.target_node_id,
    sourceTitle: nodeTitleMap.get(e.source_node_id) ?? e.source_node_id,
    targetTitle: nodeTitleMap.get(e.target_node_id) ?? e.target_node_id,
  }));

  return {
    workspaceId,
    name: workspaceName,
    color: workspaceColor,
    groups: Array.from(groupsById.values()),
    standaloneItems,
    edges,
    rawNodes,
    rawEdges,
  };
}

/**
 * Formats a WorkspaceSnapshot into a concise, token-efficient Markdown representation
 * suitable for LLM prompt context windows.
 */
export function formatSnapshotToMarkdown(snapshot: WorkspaceSnapshot): string {
  const lines: string[] = [];

  lines.push(`# Workspace: ${snapshot.name} (ID: ${snapshot.workspaceId})`);
  if (snapshot.color) {
    lines.push(`Theme Color: ${snapshot.color}`);
  }
  lines.push("");

  const formatItem = (item: SnapshotItem): string[] => {
    const itemLines: string[] = [];
    const coordStr = `[pos: (${item.position.x}, ${item.position.y})] [ID: ${item.nodeId}]`;

    switch (item.kind) {
      case "task": {
        const checkbox = item.isCompleted ? "[x]" : "[ ]";
        const parts: string[] = [];
        if (item.priority) parts.push(`P${item.priority}`);
        if (item.dueDate) parts.push(`Due: ${item.dueDate}`);
        if (item.projectName) parts.push(`Project: ${item.projectName}`);
        const meta = parts.length > 0 ? ` (${parts.join(", ")})` : "";
        itemLines.push(`- ${checkbox} Task: ${item.title}${meta} ${coordStr}`);
        break;
      }
      case "doc": {
        itemLines.push(`- Doc: ${item.title} ${coordStr}`);
        if (item.content) {
          const indented = item.content
            .split("\n")
            .map((line) => `  > ${line}`)
            .join("\n");
          itemLines.push(indented);
        }
        break;
      }
      case "habit": {
        const streakInfo =
          item.habitStreak !== undefined
            ? ` (Streak: ${item.habitStreak})`
            : "";
        itemLines.push(`- Habit: ${item.title}${streakInfo} ${coordStr}`);
        break;
      }
      case "project": {
        itemLines.push(`- Project: ${item.title} ${coordStr}`);
        break;
      }
      case "focus": {
        itemLines.push(`- Focus Timer ${coordStr}`);
        break;
      }
      default: {
        itemLines.push(`- ${item.kind}: ${item.title ?? "Item"} ${coordStr}`);
        break;
      }
    }
    return itemLines;
  };

  // Render Groups
  for (const group of snapshot.groups) {
    const groupPos = `[x: ${group.position.x}, y: ${group.position.y}, w: ${group.width ?? "auto"}, h: ${group.height ?? "auto"}]`;
    lines.push(`## Group: ${group.title} (ID: ${group.groupId}) ${groupPos}`);
    if (group.items.length === 0) {
      lines.push("  *(Empty group)*");
    } else {
      for (const item of group.items) {
        lines.push(...formatItem(item));
      }
    }
    lines.push("");
  }

  // Render Standalone Items
  if (snapshot.standaloneItems.length > 0) {
    lines.push("## Standalone Items");
    for (const item of snapshot.standaloneItems) {
      lines.push(...formatItem(item));
    }
    lines.push("");
  }

  // Render Flows
  if (snapshot.edges.length > 0) {
    lines.push("## Flows / Connections");
    for (const edge of snapshot.edges) {
      const src = edge.sourceTitle || edge.sourceNodeId;
      const tgt = edge.targetTitle || edge.targetNodeId;
      lines.push(`- ${src} -> ${tgt} (Edge ID: ${edge.id})`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}
