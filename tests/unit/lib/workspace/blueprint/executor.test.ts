import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { WorkspaceBlueprint } from "@/lib/workspace/blueprint/types";
import { workspaceCommands } from "@/lib/commands/workspace";
import { nodeCommands } from "@/lib/commands/node";
import { edgeCommands } from "@/lib/commands/edge";
import { taskCommands } from "@/lib/commands/task";
import { projectCommands } from "@/lib/commands/project";
import { habitCommands } from "@/lib/commands/habit";
import { buildWorkspaceFromBlueprint } from "@/lib/workspace/blueprint/executor";
import type {
  Workspace,
  WorkspaceNode,
  WorkspaceEdge,
} from "@/lib/types/workspace";
import type { Task, Project } from "@/lib/types/task";
import type { Habit } from "@/lib/types/habit";

vi.mock("@/lib/commands/workspace", () => ({
  workspaceCommands: {
    create: vi.fn(),
    createWorkspace: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/commands/node", () => ({
  nodeCommands: {
    add: vi.fn(),
    createNode: vi.fn(),
    move: vi.fn(),
    resize: vi.fn(),
    createGroup: vi.fn(),
    ungroup: vi.fn(),
    renameGroup: vi.fn(),
    updateDocNode: vi.fn(),
    addToGroup: vi.fn(),
    removeFromGroup: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock("@/lib/commands/edge", () => ({
  edgeCommands: {
    add: vi.fn(),
    createEdge: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock("@/lib/commands/task", () => ({
  taskCommands: {
    create: vi.fn(),
    createTask: vi.fn(),
    update: vi.fn(),
    toggle: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/commands/project", () => ({
  projectCommands: {
    create: vi.fn(),
    createProject: vi.fn(),
  },
}));

vi.mock("@/lib/commands/habit", () => ({
  habitCommands: {
    create: vi.fn(),
    createHabit: vi.fn(),
  },
}));

describe("Workspace Blueprint Execution Engine (executor.ts)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.clearAllMocks();

    vi.mocked(workspaceCommands.create).mockImplementation(
      async (_ctx, input) =>
        ({
          id: "ws-test-123",
          user_id: "user-1",
          name: input.name,
          color: input.color ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }) as Workspace,
    );

    vi.mocked(workspaceCommands.delete).mockResolvedValue(undefined);

    vi.mocked(nodeCommands.add).mockImplementation(
      async (_ctx, input) =>
        ({
          id: input.id ?? `node-${Math.random().toString(36).substring(2, 9)}`,
          workspace_id: input.workspaceId,
          user_id: "user-1",
          kind: input.kind,
          entity_type: input.entityType,
          entity_id: input.entityId,
          position_x: input.position.x,
          position_y: input.position.y,
          width: input.width ?? null,
          height: input.height ?? null,
          group_id: input.groupId ?? null,
          display_config: input.displayConfig ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }) as WorkspaceNode,
    );

    vi.mocked(edgeCommands.add).mockImplementation(
      async (_ctx, input) =>
        ({
          id: input.id,
          workspace_id: input.workspaceId,
          user_id: "user-1",
          source_node_id: input.sourceNodeId,
          target_node_id: input.targetNodeId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }) as WorkspaceEdge,
    );

    vi.mocked(taskCommands.create).mockImplementation(
      async (_ctx, input) =>
        ({
          id: input._clientId ?? "task-created-1",
          content: input.content,
          project_id: input.project_id ?? null,
          priority: input.priority ?? 4,
          due_date: input.due_date ?? null,
          is_completed: false,
        }) as unknown as Task,
    );

    vi.mocked(projectCommands.create).mockImplementation(
      async (_ctx, input) =>
        ({
          id: `project-${input.name.toLowerCase().replace(/\s+/g, "-")}`,
          name: input.name,
          color: input.color ?? "#4B6CB7",
        }) as unknown as Project,
    );

    vi.mocked(habitCommands.create).mockImplementation(
      async (_ctx, input) =>
        ({
          id: `habit-${input.name.toLowerCase().replace(/\s+/g, "-")}`,
          name: input.name,
          color: input.color ?? "#4B6CB7",
        }) as unknown as Habit,
    );
  });

  it("builds a complete workspace from a structured blueprint with groups, nodes, and flows", async () => {
    const blueprint: WorkspaceBlueprint = {
      name: "Product Sprint Q3",
      color: "#3B82F6",
      sections: [
        {
          id: "section-planning",
          title: "Sprint Planning",
          color: "#3B82F6",
          isGroup: true,
          items: [
            {
              id: "doc-guidelines",
              kind: "doc",
              title: "Sprint Goals",
              content: "# Goals\n- Deliver MVP\n- Conduct user interviews",
            },
            {
              id: "task-spec",
              kind: "task",
              content: "Write technical specification",
              priority: 1,
            },
          ],
        },
        {
          id: "section-execution",
          title: "Execution",
          isGroup: true,
          items: [
            {
              id: "task-impl",
              kind: "task",
              content: "Implement core layout compiler",
              priority: 2,
            },
            {
              id: "focus-session",
              kind: "focus",
            },
          ],
        },
      ],
      flows: [
        {
          fromItemId: "doc-guidelines",
          toItemId: "task-spec",
        },
        {
          fromItemId: "task-spec",
          toItemId: "task-impl",
        },
      ],
    };

    const result = await buildWorkspaceFromBlueprint(blueprint, {
      queryClient,
    });

    expect(result.workspaceId).toBe("ws-test-123");
    expect(workspaceCommands.create).toHaveBeenCalledWith(
      expect.objectContaining({ queryClient }),
      { name: "Product Sprint Q3", color: "#3B82F6" },
    );

    // Group containers + member items = 2 groups + 4 items = 6 nodes
    expect(result.nodeCount).toBe(6);
    expect(result.edgeCount).toBe(2);

    // Verify group nodes were added
    expect(nodeCommands.add).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: "section-planning",
        workspaceId: "ws-test-123",
        kind: "group",
        groupId: null,
        displayConfig: expect.objectContaining({ title: "Sprint Planning" }),
      }),
    );
    expect(nodeCommands.add).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: "section-execution",
        workspaceId: "ws-test-123",
        kind: "group",
        groupId: null,
        displayConfig: expect.objectContaining({ title: "Execution" }),
      }),
    );

    // Verify member nodes have relative coordinates and parent group ID
    expect(nodeCommands.add).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: "doc-guidelines",
        workspaceId: "ws-test-123",
        kind: "doc",
        groupId: "section-planning",
        displayConfig: expect.objectContaining({
          title: "Sprint Goals",
          content: "# Goals\n- Deliver MVP\n- Conduct user interviews",
        }),
      }),
    );

    expect(nodeCommands.add).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: "task-spec",
        workspaceId: "ws-test-123",
        kind: "task",
        groupId: "section-planning",
      }),
    );

    // Verify task creation was invoked
    expect(taskCommands.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        content: "Write technical specification",
        priority: 1,
      }),
    );

    // Verify edges were created with proper endpoints
    expect(edgeCommands.add).toHaveBeenCalledTimes(2);
    expect(edgeCommands.add).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workspaceId: "ws-test-123",
        sourceNodeId: "doc-guidelines",
        targetNodeId: "task-spec",
      }),
    );
    expect(edgeCommands.add).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workspaceId: "ws-test-123",
        sourceNodeId: "task-spec",
        targetNodeId: "task-impl",
      }),
    );
  });

  it("reuses existing entities when IDs are provided in blueprint items", async () => {
    const blueprint: WorkspaceBlueprint = {
      name: "Existing References",
      sections: [
        {
          id: "section-1",
          title: "Active",
          items: [
            {
              id: "item-existing-task",
              kind: "task",
              content: "Ignored because existingTaskId is provided",
              existingTaskId: "pre-existing-task-999",
            },
            {
              id: "item-existing-habit",
              kind: "habit",
              name: "Existing Habit",
              existingHabitId: "pre-existing-habit-888",
            },
            {
              id: "item-existing-project",
              kind: "project",
              name: "Existing Project",
              existingProjectId: "pre-existing-proj-777",
            },
          ],
        },
      ],
    };

    const result = await buildWorkspaceFromBlueprint(blueprint, {
      queryClient,
    });

    expect(result.workspaceId).toBe("ws-test-123");
    // Should NOT have created new entities
    expect(taskCommands.create).not.toHaveBeenCalled();
    expect(habitCommands.create).not.toHaveBeenCalled();
    expect(projectCommands.create).not.toHaveBeenCalled();

    // Node references should directly bind to existing IDs
    expect(nodeCommands.add).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: "item-existing-task",
        kind: "task",
        entityType: "task",
        entityId: "pre-existing-task-999",
      }),
    );

    expect(nodeCommands.add).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: "item-existing-habit",
        kind: "habit",
        entityType: "habit",
        entityId: "pre-existing-habit-888",
      }),
    );

    expect(nodeCommands.add).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: "item-existing-project",
        kind: "project",
        entityType: "project",
        entityId: "pre-existing-proj-777",
      }),
    );
  });

  it("creates new entities and links tasks to projects when specified by name", async () => {
    const blueprint: WorkspaceBlueprint = {
      name: "Project & Habit Creation",
      sections: [
        {
          id: "section-1",
          title: "Track",
          items: [
            {
              id: "item-proj",
              kind: "project",
              name: "Compiler Pipeline",
              color: "#10B981",
            },
            {
              id: "item-habit",
              kind: "habit",
              name: "Daily Code Review",
              color: "#F59E0B",
            },
            {
              id: "item-task",
              kind: "task",
              content: "Write AST generator",
              projectName: "Compiler Pipeline",
            },
          ],
        },
      ],
    };

    await buildWorkspaceFromBlueprint(blueprint, { queryClient });

    expect(projectCommands.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: "Compiler Pipeline",
        color: "#10B981",
      }),
    );

    expect(habitCommands.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: "Daily Code Review",
        color: "#F59E0B",
      }),
    );

    // Task should be linked to the created project id "project-compiler-pipeline"
    expect(taskCommands.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        content: "Write AST generator",
        project_id: "project-compiler-pipeline",
      }),
    );
  });

  it("rejects and rolls back if blueprint contains invalid flow references", async () => {
    const invalidBlueprint: WorkspaceBlueprint = {
      name: "Broken Flows",
      sections: [
        {
          id: "sec-1",
          title: "Section 1",
          items: [
            {
              id: "item-1",
              kind: "doc",
              title: "Doc 1",
              content: "Text",
            },
          ],
        },
      ],
      flows: [
        {
          fromItemId: "item-1",
          toItemId: "non-existent-target",
        },
      ],
    };

    await expect(
      buildWorkspaceFromBlueprint(invalidBlueprint, { queryClient }),
    ).rejects.toThrow(/invalid flow reference/i);

    // Must not leave orphaned workspace or nodes
    expect(nodeCommands.add).not.toHaveBeenCalled();
    expect(edgeCommands.add).not.toHaveBeenCalled();
  });

  it("rolls back workspace if a node command fails during execution", async () => {
    const blueprint: WorkspaceBlueprint = {
      name: "Failing Node",
      sections: [
        {
          id: "sec-1",
          title: "Section 1",
          items: [
            {
              id: "item-1",
              kind: "doc",
              title: "Doc 1",
              content: "Text",
            },
          ],
        },
      ],
    };

    vi.mocked(nodeCommands.add).mockRejectedValueOnce(
      new Error("Network connection dropped"),
    );

    await expect(
      buildWorkspaceFromBlueprint(blueprint, { queryClient }),
    ).rejects.toThrow("Network connection dropped");

    // Must clean up the created workspace
    expect(workspaceCommands.delete).toHaveBeenCalledWith(
      expect.anything(),
      "ws-test-123",
    );
  });
});
