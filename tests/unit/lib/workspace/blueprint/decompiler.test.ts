import { describe, it, expect, vi } from "vitest";
import {
  decompileWorkspaceToSnapshot,
  formatSnapshotToMarkdown,
  type DecompilerContext,
} from "@/lib/workspace/blueprint/decompiler";
import type {
  Workspace,
  WorkspaceNode,
  WorkspaceEdge,
} from "@/lib/types/workspace";
import type { Task, Project } from "@/lib/types/task";
import type { Habit } from "@/lib/types/habit";

describe("Semantic Snapshot Decompiler (decompiler.ts)", () => {
  const mockWorkspace: Workspace = {
    id: "ws-1",
    name: "Product Roadmap",
    color: "#4B6CB7",
    user_id: "user-1",
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  };

  const mockNodes: WorkspaceNode[] = [
    // Group 1
    {
      id: "group-1",
      workspace_id: "ws-1",
      user_id: "user-1",
      kind: "group",
      entity_type: null,
      entity_id: null,
      position_x: 0,
      position_y: 0,
      width: 320,
      height: 400,
      group_id: null,
      display_config: { title: "Milestone 1", color: "#3B82F6" },
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    },
    // Doc inside Group 1
    {
      id: "node-doc-1",
      workspace_id: "ws-1",
      user_id: "user-1",
      kind: "doc",
      entity_type: null,
      entity_id: null,
      position_x: 24,
      position_y: 48,
      width: 280,
      height: 180,
      group_id: "group-1",
      display_config: {
        title: "Sprint Specs",
        content: "Detailed requirements for M1",
      },
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    },
    // Task inside Group 1
    {
      id: "node-task-1",
      workspace_id: "ws-1",
      user_id: "user-1",
      kind: "task",
      entity_type: "task",
      entity_id: "task-real-1",
      position_x: 24,
      position_y: 248,
      width: 260,
      height: 96,
      group_id: "group-1",
      display_config: null,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    },
    // Standalone Task
    {
      id: "node-task-standalone",
      workspace_id: "ws-1",
      user_id: "user-1",
      kind: "task",
      entity_type: "task",
      entity_id: "task-real-2",
      position_x: 400,
      position_y: 0,
      width: 260,
      height: 96,
      group_id: null,
      display_config: null,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    },
    // Standalone Habit
    {
      id: "node-habit-standalone",
      workspace_id: "ws-1",
      user_id: "user-1",
      kind: "habit",
      entity_type: "habit",
      entity_id: "habit-real-1",
      position_x: 400,
      position_y: 120,
      width: 240,
      height: 88,
      group_id: null,
      display_config: null,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    },
    // Standalone Project
    {
      id: "node-project-standalone",
      workspace_id: "ws-1",
      user_id: "user-1",
      kind: "project",
      entity_type: "project",
      entity_id: "project-real-1",
      position_x: 400,
      position_y: 230,
      width: 280,
      height: 120,
      group_id: null,
      display_config: null,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    },
    // Standalone Focus
    {
      id: "node-focus-standalone",
      workspace_id: "ws-1",
      user_id: "user-1",
      kind: "focus",
      entity_type: null,
      entity_id: null,
      position_x: 400,
      position_y: 370,
      width: 220,
      height: 100,
      group_id: null,
      display_config: null,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    },
    // Orphaned Task Node
    {
      id: "node-task-orphaned",
      workspace_id: "ws-1",
      user_id: "user-1",
      kind: "task",
      entity_type: "task",
      entity_id: "task-missing-999",
      position_x: 400,
      position_y: 500,
      width: 260,
      height: 96,
      group_id: null,
      display_config: null,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    },
  ];

  const mockEdges: WorkspaceEdge[] = [
    {
      id: "edge-1",
      workspace_id: "ws-1",
      user_id: "user-1",
      source_node_id: "node-doc-1",
      target_node_id: "node-task-1",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    },
    {
      id: "edge-2",
      workspace_id: "ws-1",
      user_id: "user-1",
      source_node_id: "node-task-1",
      target_node_id: "node-task-standalone",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    },
  ];

  const mockTasks: Record<string, Task> = {
    "task-real-1": {
      id: "task-real-1",
      user_id: "user-1",
      content: "Setup Database",
      is_completed: true,
      priority: 1,
      due_date: "2026-09-15",
      project_id: "project-real-1",
    } as unknown as Task,
    "task-real-2": {
      id: "task-real-2",
      user_id: "user-1",
      content: "Deploy staging",
      is_completed: false,
      priority: 2,
      due_date: null,
      project_id: null,
    } as unknown as Task,
  };

  const mockProjects: Record<string, Project> = {
    "project-real-1": {
      id: "project-real-1",
      user_id: "user-1",
      name: "Infra Core",
      color: "#10B981",
    } as unknown as Project,
  };

  const mockHabits: Record<string, Habit> = {
    "habit-real-1": {
      id: "habit-real-1",
      name: "Daily Standup",
      color: "#6366F1",
    } as unknown as Habit,
  };

  const mockContext: DecompilerContext = {
    workspace: mockWorkspace,
    nodes: mockNodes,
    edges: mockEdges,
    getTask: async (id) => mockTasks[id] || null,
    getProject: async (id) => mockProjects[id] || null,
    getHabit: async (id) => mockHabits[id] || null,
  };

  it("decompiles workspace nodes and edges into a structured snapshot", async () => {
    const snapshot = await decompileWorkspaceToSnapshot("ws-1", mockContext);

    expect(snapshot.workspaceId).toBe("ws-1");
    expect(snapshot.name).toBe("Product Roadmap");
    expect(snapshot.color).toBe("#4B6CB7");

    // Check group structure
    expect(snapshot.groups).toHaveLength(1);
    const group = snapshot.groups[0];
    expect(group.groupId).toBe("group-1");
    expect(group.title).toBe("Milestone 1");
    expect(group.color).toBe("#3B82F6");
    expect(group.items).toHaveLength(2);

    // Group items: doc & task
    const docItem = group.items.find((i) => i.nodeId === "node-doc-1");
    expect(docItem).toBeDefined();
    expect(docItem?.kind).toBe("doc");
    expect(docItem?.title).toBe("Sprint Specs");
    expect(docItem?.content).toBe("Detailed requirements for M1");

    const taskItem = group.items.find((i) => i.nodeId === "node-task-1");
    expect(taskItem).toBeDefined();
    expect(taskItem?.kind).toBe("task");
    expect(taskItem?.title).toBe("Setup Database");
    expect(taskItem?.isCompleted).toBe(true);
    expect(taskItem?.priority).toBe(1);
    expect(taskItem?.projectName).toBe("Infra Core");

    // Check standalone items
    expect(snapshot.standaloneItems).toHaveLength(5);

    // Check edges
    expect(snapshot.edges).toHaveLength(2);
    expect(snapshot.edges[0]).toEqual(
      expect.objectContaining({
        id: "edge-1",
        sourceNodeId: "node-doc-1",
        targetNodeId: "node-task-1",
        sourceTitle: "Sprint Specs",
        targetTitle: "Setup Database",
      }),
    );
  });

  it("handles orphaned nodes gracefully", async () => {
    const snapshot = await decompileWorkspaceToSnapshot("ws-1", mockContext);
    const orphanedItem = snapshot.standaloneItems.find(
      (i) => i.nodeId === "node-task-orphaned",
    );

    expect(orphanedItem).toBeDefined();
    expect(orphanedItem?.isOrphaned).toBe(true);
    expect(orphanedItem?.title).toContain("Deleted");
  });

  it("formats snapshot into clean, informative Markdown", async () => {
    const snapshot = await decompileWorkspaceToSnapshot("ws-1", mockContext);
    const markdown = formatSnapshotToMarkdown(snapshot);

    expect(markdown).toContain("# Workspace: Product Roadmap");
    expect(markdown).toContain("## Group: Milestone 1");
    expect(markdown).toContain("Sprint Specs");
    expect(markdown).toContain("Detailed requirements for M1");
    expect(markdown).toContain("[x] Task: Setup Database");
    expect(markdown).toContain("P1");
    expect(markdown).toContain("## Standalone Items");
    expect(markdown).toContain("[ ] Task: Deploy staging");
    expect(markdown).toContain("Habit: Daily Standup");
    expect(markdown).toContain("Project: Infra Core");
    expect(markdown).toContain("Focus Timer");
    expect(markdown).toContain("## Flows / Connections");
    expect(markdown).toContain("Sprint Specs -> Setup Database");
    expect(markdown).toContain("Setup Database -> Deploy staging");
  });
});
