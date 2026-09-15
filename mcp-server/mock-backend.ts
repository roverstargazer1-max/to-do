import type { BlueprintCommandAdapters } from "../src/lib/workspace/blueprint/commands";
import type {
  AddNodeInput,
  ResizeNodeInput,
  UpdateDecisionNodeInput,
  UpdateDocNodeInput,
  UpdateStepNodeInput,
  Workspace,
  WorkspaceEdge,
  WorkspaceNode,
} from "../src/lib/types/workspace";
import type { Habit } from "../src/lib/types/habit";
import type { Project, Task } from "../src/lib/types/task";

export interface MockBackendInput {
  userId: string;
  workspaces?: Workspace[];
  nodes?: WorkspaceNode[];
  edges?: WorkspaceEdge[];
  tasks?: Task[];
  projects?: Project[];
  habits?: Habit[];
}

export interface MockBackendState {
  workspaces: Workspace[];
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
  tasks: Task[];
  projects: Project[];
  habits: Habit[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function now(): string {
  return new Date().toISOString();
}

/**
 * Process-local MCP backend used only for explicit mock/test execution.
 * Its command adapters have the same seam as the production Domain Commands,
 * so MCP contract tests exercise the Blueprint Engine rather than a second
 * MCP-specific builder implementation.
 */
export class McpMockBackend {
  readonly userId: string;
  private readonly workspaces: Workspace[];
  private readonly nodes: WorkspaceNode[];
  private readonly edges: WorkspaceEdge[];
  private readonly tasks: Task[];
  private readonly projects: Project[];
  private readonly habits: Habit[];
  private idCounter = 0;

  readonly commandAdapters: BlueprintCommandAdapters;

  constructor(input: MockBackendInput) {
    this.userId = input.userId;
    this.workspaces = (input.workspaces ?? []).map((item) => clone(item));
    this.nodes = (input.nodes ?? []).map((item) => ({
      ...clone(item),
      group_id: item.group_id ?? null,
      user_id: item.user_id || input.userId,
    }));
    this.edges = (input.edges ?? []).map((item) => ({
      ...clone(item),
      user_id: item.user_id || input.userId,
    }));
    this.tasks = (input.tasks ?? []).map((item) => ({
      ...clone(item),
      user_id: item.user_id || input.userId,
    }));
    this.projects = (input.projects ?? []).map((item) => ({
      ...clone(item),
      user_id: item.user_id || input.userId,
    }));
    this.habits = (input.habits ?? []).map((item) => ({
      ...clone(item),
      user_id: item.user_id || input.userId,
    }));

    this.commandAdapters = {
      workspace: {
        create: async (_ctx, input) => this.createWorkspace(input),
        delete: async (_ctx, id) => this.deleteWorkspace(id),
      },
      node: {
        add: async (_ctx, input) => this.addNode(input),
        resize: async (_ctx, input) => this.resizeNode(input),
        updateDocNode: async (_ctx, input) => this.updateDocNode(input),
        updateDecisionNode: async (_ctx, input) =>
          this.updateDecisionNode(input),
        updateStepNode: async (_ctx, input) => this.updateStepNode(input),
        remove: async (_ctx, node) => this.removeNode(node.id),
      },
      edge: {
        add: async (_ctx, input) => this.addEdge(input),
        remove: async (_ctx, edge) => this.removeEdge(edge.id),
      },
      task: {
        create: async (_ctx, input) => this.createTask(input),
      },
      project: {
        create: async (_ctx, input) => this.createProject(input),
      },
      habit: {
        create: async (_ctx, input) => this.createHabit(input),
      },
      compensate: {
        task: async (_ctx, id) => this.deleteTask(id),
        project: async (_ctx, id) => this.deleteProject(id),
        habit: async (_ctx, id) => this.deleteHabit(id),
      },
    };
  }

  getState(): MockBackendState {
    return {
      workspaces: clone(this.workspaces),
      nodes: clone(this.nodes),
      edges: clone(this.edges),
      tasks: clone(this.tasks),
      projects: clone(this.projects),
      habits: clone(this.habits),
    };
  }

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-mock-${this.idCounter}`;
  }

  private createWorkspace(input: { name: string; color?: string }): Workspace {
    const timestamp = now();
    const workspace: Workspace = {
      id: this.nextId("ws"),
      user_id: this.userId,
      name: input.name,
      color: input.color ?? null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.workspaces.push(workspace);
    return clone(workspace);
  }

  private deleteWorkspace(id: string): void {
    const index = this.workspaces.findIndex((item) => item.id === id);
    if (index !== -1) this.workspaces.splice(index, 1);
    for (let i = this.nodes.length - 1; i >= 0; i -= 1) {
      if (this.nodes[i].workspace_id === id) this.nodes.splice(i, 1);
    }
    for (let i = this.edges.length - 1; i >= 0; i -= 1) {
      if (this.edges[i].workspace_id === id) this.edges.splice(i, 1);
    }
  }

  private addNode(input: AddNodeInput): WorkspaceNode {
    const requestedId = input.id;
    const id =
      requestedId && !this.nodes.some((item) => item.id === requestedId)
        ? requestedId
        : this.nextId("node");
    const timestamp = now();
    const node: WorkspaceNode = {
      id,
      workspace_id: input.workspaceId,
      user_id: this.userId,
      kind: input.kind,
      entity_type: input.entityType,
      entity_id: input.entityId,
      position_x: input.position.x,
      position_y: input.position.y,
      width: input.width ?? null,
      height: input.height ?? null,
      group_id: input.groupId ?? input.parentId ?? null,
      display_config: clone(input.displayConfig ?? null),
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.nodes.push(node);
    return clone(node);
  }

  private findNode(id: string): WorkspaceNode {
    const node = this.nodes.find((item) => item.id === id);
    if (!node) throw new Error(`Node "${id}" not found`);
    return node;
  }

  private resizeNode(input: ResizeNodeInput): void {
    const node = this.findNode(input.nodeId);
    node.width = input.width;
    node.height = input.height;
    node.updated_at = now();
  }

  private updateDocNode(input: UpdateDocNodeInput): void {
    const node = this.findNode(input.nodeId);
    if (node.kind !== "doc")
      throw new Error(`Node "${input.nodeId}" is not a doc node`);
    node.display_config = {
      ...(node.display_config ?? {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
    };
    node.updated_at = now();
  }

  private updateDecisionNode(input: UpdateDecisionNodeInput): void {
    const node = this.findNode(input.nodeId);
    if (node.kind !== "decision") {
      throw new Error(`Node "${input.nodeId}" is not a decision node`);
    }
    node.display_config = {
      ...(node.display_config ?? {}),
      ...(input.question !== undefined ? { question: input.question } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
    };
    node.updated_at = now();
  }

  private updateStepNode(input: UpdateStepNodeInput): void {
    const node = this.findNode(input.nodeId);
    if (node.kind !== "step") {
      throw new Error(`Node "${input.nodeId}" is not a step node`);
    }
    node.display_config = {
      ...(node.display_config ?? {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
    };
    node.updated_at = now();
  }

  private removeNode(id: string): void {
    const index = this.nodes.findIndex((item) => item.id === id);
    if (index === -1) throw new Error(`Node "${id}" not found`);
    const target = this.nodes[index];

    if (target.kind === "group") {
      for (const node of this.nodes) {
        if (node.group_id === id) {
          node.position_x += target.position_x;
          node.position_y += target.position_y;
          node.group_id = null;
        }
      }
    }

    const previousGroupId = target.group_id;
    this.nodes.splice(index, 1);
    this.removeEdgesTouching(id);

    if (
      previousGroupId &&
      !this.nodes.some((item) => item.group_id === previousGroupId)
    ) {
      const groupIndex = this.nodes.findIndex(
        (item) => item.id === previousGroupId,
      );
      if (groupIndex !== -1) this.nodes.splice(groupIndex, 1);
      this.removeEdgesTouching(previousGroupId);
    }
  }

  private removeEdgesTouching(nodeId: string): void {
    for (let i = this.edges.length - 1; i >= 0; i -= 1) {
      if (
        this.edges[i].source_node_id === nodeId ||
        this.edges[i].target_node_id === nodeId
      ) {
        this.edges.splice(i, 1);
      }
    }
  }

  private addEdge(
    input: Parameters<BlueprintCommandAdapters["edge"]["add"]>[1],
  ): WorkspaceEdge {
    if (input.sourceNodeId === input.targetNodeId) {
      throw new Error("Self-connections are not allowed");
    }
    if (
      !this.nodes.some((item) => item.id === input.sourceNodeId) ||
      !this.nodes.some((item) => item.id === input.targetNodeId)
    ) {
      throw new Error("Connection endpoint not found");
    }
    if (
      this.edges.some(
        (edge) =>
          edge.source_node_id === input.sourceNodeId &&
          edge.target_node_id === input.targetNodeId,
      )
    ) {
      throw new Error("Duplicate connection");
    }
    const requestedId = input.id;
    const id =
      requestedId && !this.edges.some((edge) => edge.id === requestedId)
        ? requestedId
        : this.nextId("edge");
    const timestamp = now();
    const edge: WorkspaceEdge = {
      id,
      workspace_id: input.workspaceId,
      user_id: this.userId,
      source_node_id: input.sourceNodeId,
      target_node_id: input.targetNodeId,
      label: input.label ?? null,
      source_handle: input.source_handle ?? input.sourceHandle ?? null,
      target_handle: input.target_handle ?? input.targetHandle ?? null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.edges.push(edge);
    return clone(edge);
  }

  private removeEdge(id: string): void {
    const index = this.edges.findIndex((item) => item.id === id);
    if (index === -1) throw new Error(`Edge "${id}" not found`);
    this.edges.splice(index, 1);
  }

  private createTask(
    input: Parameters<BlueprintCommandAdapters["task"]["create"]>[1],
  ): Promise<Task> {
    const timestamp = now();
    const task: Task = {
      id: input._clientId ?? this.nextId("task"),
      user_id: this.userId,
      project_id: input.project_id ?? null,
      parent_id: input.parent_id ?? null,
      content: input.content,
      description: input.description ?? null,
      priority: input.priority ?? 4,
      due_date: input.due_date ?? null,
      do_date: input.do_date ?? null,
      is_evening: input.is_evening ?? false,
      is_completed: false,
      completed_at: null,
      day_order: this.tasks.length,
      recurrence: input.recurrence ?? null,
      recurring_series_id: null,
      google_event_id: null,
      google_etag: null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.tasks.push(task);
    return Promise.resolve(clone(task));
  }

  private createProject(
    input: Parameters<BlueprintCommandAdapters["project"]["create"]>[1],
  ): Promise<Project> {
    const timestamp = now();
    const project: Project = {
      id: this.nextId("project"),
      user_id: this.userId,
      name: input.name,
      color: input.color ?? "#4B6CB7",
      view_style: "list",
      is_inbox: false,
      is_archived: false,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.projects.push(project);
    return Promise.resolve(clone(project));
  }

  private createHabit(
    input: Parameters<BlueprintCommandAdapters["habit"]["create"]>[1],
  ): Promise<Habit> {
    const timestamp = now();
    const habit: Habit = {
      id: this.nextId("habit"),
      user_id: this.userId,
      name: input.name,
      description: input.description ?? null,
      color: input.color ?? "#4B6CB7",
      icon: input.icon ?? null,
      created_at: timestamp,
      updated_at: timestamp,
      archived_at: null,
      start_date: input.start_date ?? timestamp.slice(0, 10),
      sort_order: this.habits.length,
      habit_type: input.habitType ?? "boolean",
      frequency_count: input.frequencyCount ?? null,
      frequency_period: input.frequencyPeriod ?? "day",
      target_type: input.targetType ?? "at_least",
      target_value: input.targetValue ?? null,
      unit: input.unit ?? null,
      source_uuid: input.source_uuid ?? null,
    };
    this.habits.push(habit);
    return Promise.resolve(clone(habit));
  }

  private deleteTask(id: string): void {
    const index = this.tasks.findIndex((item) => item.id === id);
    if (index !== -1) this.tasks.splice(index, 1);
  }

  private deleteProject(id: string): void {
    const index = this.projects.findIndex((item) => item.id === id);
    if (index !== -1) this.projects.splice(index, 1);
  }

  private deleteHabit(id: string): void {
    const index = this.habits.findIndex((item) => item.id === id);
    if (index !== -1) this.habits.splice(index, 1);
  }
}

export function isOwnedByMockAccount(
  record: { user_id?: string | null },
  userId: string,
): boolean {
  return !record.user_id || record.user_id === userId;
}
