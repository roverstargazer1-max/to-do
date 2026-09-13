import { describe, it, expect, beforeEach } from "vitest";
import { createKagelinMcpServer } from "../../../mcp-server/server";
import type {
  Workspace,
  WorkspaceNode,
  WorkspaceEdge,
} from "@/lib/types/workspace";
import type { Task, Project } from "@/lib/types/task";
import type { Habit } from "@/lib/types/habit";
import type {
  WorkspaceBlueprint,
  BlueprintPatch,
} from "@/lib/workspace/blueprint/types";

describe("Kagelin MCP Server (mcp-server/server.ts)", () => {
  const mockWorkspaces: Workspace[] = [
    {
      id: "ws-1",
      name: "Q3 Roadmap",
      color: "#3B82F6",
      user_id: "user-1",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    },
  ];

  const mockNodes: WorkspaceNode[] = [
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
      height: 200,
      group_id: null,
      display_config: { title: "Phase 1" },
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    },
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
      height: 120,
      group_id: "group-1",
      display_config: { title: "Architecture Spec", content: "Details here" },
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    },
  ];

  const mockEdges: WorkspaceEdge[] = [];

  const mockTasks: Task[] = [
    {
      id: "task-1",
      user_id: "user-1",
      content: "Design schema",
      priority: 1,
      is_completed: false,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
      project_id: "proj-1",
    } as unknown as Task,
  ];

  const mockProjects: Project[] = [
    {
      id: "proj-1",
      user_id: "user-1",
      name: "Core Engine",
      color: "#10B981",
    } as unknown as Project,
  ];

  const mockHabits: Habit[] = [
    {
      id: "habit-1",
      name: "Code Daily",
      color: "#6366F1",
    } as unknown as Habit,
  ];

  let mcpServer: ReturnType<typeof createKagelinMcpServer>;

  beforeEach(() => {
    mcpServer = createKagelinMcpServer({
      useMockFallback: true,
      initialWorkspaces: [...mockWorkspaces],
      initialNodes: [...mockNodes],
      initialEdges: [...mockEdges],
      initialTasks: [...mockTasks],
      initialProjects: [...mockProjects],
      initialHabits: [...mockHabits],
    });
  });

  it("registers all 5 required tools with schemas", () => {
    const tools = (mcpServer as any)._registeredTools;
    expect(tools).toBeDefined();
    expect(tools.list_workspaces).toBeDefined();
    expect(tools.inspect_app_context).toBeDefined();
    expect(tools.get_workspace_blueprint).toBeDefined();
    expect(tools.build_workspace).toBeDefined();
    expect(tools.patch_workspace).toBeDefined();
  });

  it("executes list_workspaces tool correctly", async () => {
    const tool = (mcpServer as any)._registeredTools.list_workspaces;
    const response = await tool.handler({});
    expect(response.content).toHaveLength(1);
    expect(response.content[0].type).toBe("text");

    const data = JSON.parse(response.content[0].text);
    expect(data.workspaces).toHaveLength(1);
    expect(data.workspaces[0]).toEqual(
      expect.objectContaining({
        id: "ws-1",
        name: "Q3 Roadmap",
        color: "#3B82F6",
        nodeCount: 2,
      }),
    );
  });

  it("executes inspect_app_context tool correctly", async () => {
    const tool = (mcpServer as any)._registeredTools.inspect_app_context;
    const response = await tool.handler({ limit: 10 });
    expect(response.content).toHaveLength(1);

    const data = JSON.parse(response.content[0].text);
    expect(data.projects).toHaveLength(1);
    expect(data.projects[0].name).toBe("Core Engine");
    expect(data.habits).toHaveLength(1);
    expect(data.habits[0].name).toBe("Code Daily");
    expect(data.recentTasks).toHaveLength(1);
    expect(data.recentTasks[0].content).toBe("Design schema");
  });

  it("executes get_workspace_blueprint tool correctly", async () => {
    const tool = (mcpServer as any)._registeredTools.get_workspace_blueprint;
    const response = await tool.handler({ workspaceId: "ws-1" });
    expect(response.content).toHaveLength(1);

    const data = JSON.parse(response.content[0].text);
    expect(data.markdown).toContain("# Workspace: Q3 Roadmap");
    expect(data.markdown).toContain("## Group: Phase 1");
    expect(data.markdown).toContain("Architecture Spec");
    expect(data.snapshot.workspaceId).toBe("ws-1");
    expect(data.snapshot.groups).toHaveLength(1);
  });

  it("executes build_workspace tool correctly", async () => {
    const tool = (mcpServer as any)._registeredTools.build_workspace;
    const blueprint: WorkspaceBlueprint = {
      name: "New AI Workspace",
      color: "#EC4899",
      sections: [
        {
          id: "sec-start",
          title: "Getting Started",
          isGroup: true,
          items: [
            {
              id: "item-task-1",
              kind: "task",
              content: "First Action Item",
            },
          ],
        },
      ],
    };

    const response = await tool.handler({ blueprint });
    expect(response.content).toHaveLength(1);

    const data = JSON.parse(response.content[0].text);
    expect(data.success).toBe(true);
    expect(data.workspaceId).toBeDefined();
    expect(data.nodeCount).toBe(2); // 1 group + 1 task
  });

  it("executes patch_workspace tool correctly", async () => {
    const tool = (mcpServer as any)._registeredTools.patch_workspace;
    const patch: BlueprintPatch = {
      workspaceId: "ws-1",
      updateDocs: [
        {
          nodeId: "node-doc-1",
          title: "Updated Spec Title",
          content: "Updated Content",
        },
      ],
    };

    const response = await tool.handler({ patch });
    expect(response.content).toHaveLength(1);

    const data = JSON.parse(response.content[0].text);
    expect(data.success).toBe(true);
    expect(data.result.updatedDocNodeIds).toContain("node-doc-1");
  });
});
