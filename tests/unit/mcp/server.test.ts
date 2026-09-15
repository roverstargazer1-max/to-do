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

function responseData(response: any): Record<string, any> {
  return JSON.parse(response.content[0].text) as Record<string, any>;
}

function errorCategory(response: any): string {
  return responseData(response).error.category;
}

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

  it("supports bounded context filters and identifies canonical build receipts", async () => {
    const contextTool = (mcpServer as any)._registeredTools.inspect_app_context;
    const contextResponse = await contextTool.handler({
      query: "code",
      entityKind: "habit",
      limit: 1,
    });
    const context = JSON.parse(contextResponse.content[0].text);
    expect(context.habits).toHaveLength(1);
    expect(context.habits[0].id).toBe("habit-1");
    expect(context.projects).toHaveLength(0);
    expect(context.recentTasks).toHaveLength(0);

    const buildTool = (mcpServer as any)._registeredTools.build_workspace;
    const response = await buildTool.handler({
      requestId: "canonical-build-1",
      blueprint: {
        name: "Receipt Workspace",
        sections: [
          {
            id: "receipt-section",
            title: "Work",
            items: [
              {
                id: "semantic-task",
                kind: "task",
                content: "Design schema",
                existingTaskId: "task-1",
              },
            ],
          },
        ],
      },
    });
    const data = JSON.parse(response.content[0].text);
    expect(data.inputForm).toBe("canonical");
    expect(data.contractVersion).toBeDefined();
    expect(data.itemNodeIds["semantic-task"]).toBe("semantic-task");
    expect(data.linkedEntityIds.tasks).toEqual(["task-1"]);
    expect(data.createdEntityIds.tasks).toEqual([]);
    expect(data.counts).toEqual(
      expect.objectContaining({ nodes: 1, edges: 0, addedNodes: 1 }),
    );
    expect(response.structuredContent).toEqual(data);
  });

  it("keeps legacy flat build inputs working and labels them as compatibility forms", async () => {
    const tool = (mcpServer as any)._registeredTools.build_workspace;
    const response = await tool.handler({
      name: "Legacy Workspace",
      sections: [
        {
          id: "legacy-section",
          title: "Legacy",
          items: [
            { id: "legacy-doc", kind: "doc", title: "Note", content: "Text" },
          ],
        },
      ],
    });
    const data = JSON.parse(response.content[0].text);
    expect(data.success).toBe(true);
    expect(data.inputForm).toBe("legacy");
    expect(data.warnings[0]).toMatch(/legacy flat/i);
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
    expect(data.updatedNodeIds).toContain("node-doc-1");
    expect(data.counts.updatedNodes).toBe(1);
    expect(response.structuredContent).toEqual(data);
  });

  it("executes build_workspace with mermaid string to generate flowchart with tasks, decisions, and labeled edges", async () => {
    const tool = (mcpServer as any)._registeredTools.build_workspace;
    const mermaid = `
graph LR
  A[任务: 编写代码 #p1] --> B{是否通过测试?}
  B -->|通过| C[任务: 部署上线 #p2]
  B -->|不通过| D[步骤: 修复缺陷]
  D --> A
`;

    const response = await tool.handler({
      mermaid,
      name: "Mermaid Flowchart Workspace",
      color: "#6366f1",
    });
    expect(response.content).toHaveLength(1);

    const data = JSON.parse(response.content[0].text);
    expect(data.success).toBe(true);
    expect(data.workspaceId).toBeDefined();
    // 4 nodes: task A, decision B, task C, step D
    expect(data.nodeCount).toBe(4);
    // 4 edges: A->B, B->C, B->D, D->A
    expect(data.edgeCount).toBe(4);
  });

  it("executes patch_workspace with decision, step, and labeled flow", async () => {
    const tool = (mcpServer as any)._registeredTools.patch_workspace;
    const patch: BlueprintPatch = {
      workspaceId: "ws-1",
      addItems: [
        {
          item: {
            id: "dec-1",
            kind: "decision",
            question: "Is architecture approved?",
            description: "Check RFC discussion",
          },
        },
        {
          item: {
            id: "step-1",
            kind: "step",
            title: "Manual Verification",
            description: "Run smoke test checklist",
          },
        },
      ],
      addFlows: [
        {
          fromItemId: "dec-1",
          toItemId: "step-1",
          label: "Approved",
          fromPort: "out",
        },
      ],
    };

    const response = await tool.handler({ patch });
    expect(response.content).toHaveLength(1);

    const data = JSON.parse(response.content[0].text);
    expect(data.success).toBe(true);
    expect(data.result.addedNodes).toHaveLength(2);
    expect(data.result.addedNodes[0]).toEqual(
      expect.objectContaining({
        id: "dec-1",
        kind: "decision",
        display_config: {
          question: "Is architecture approved?",
          description: "Check RFC discussion",
        },
      }),
    );
    expect(data.result.addedNodes[1]).toEqual(
      expect.objectContaining({
        id: "step-1",
        kind: "step",
        display_config: {
          title: "Manual Verification",
          description: "Run smoke test checklist",
        },
      }),
    );
    expect(data.result.addedEdges).toHaveLength(1);
    expect(data.result.addedEdges[0]).toEqual(
      expect.objectContaining({
        source_node_id: "dec-1",
        target_node_id: "step-1",
        label: "Approved",
        source_handle: "out",
      }),
    );
  });

  it("executes patch_workspace with updateDecisions and updateSteps", async () => {
    const patchTool = (mcpServer as any)._registeredTools.patch_workspace;

    // 1. Add decision and step
    await patchTool.handler({
      patch: {
        workspaceId: "ws-1",
        addItems: [
          {
            item: {
              id: "dec-update-test",
              kind: "decision",
              question: "Original Question?",
              description: "Original Description",
            },
          },
          {
            item: {
              id: "step-update-test",
              kind: "step",
              title: "Original Title",
              description: "Original Description",
            },
          },
        ],
      },
    });

    // 2. In-place update via patch_workspace
    const updateResponse = await patchTool.handler({
      patch: {
        workspaceId: "ws-1",
        updateDecisions: [
          {
            nodeId: "dec-update-test",
            question: "Updated Question?",
            description: "Updated Description",
          },
        ],
        updateSteps: [
          {
            nodeId: "step-update-test",
            title: "Updated Title",
          },
        ],
      },
    });

    expect(updateResponse.content).toHaveLength(1);
    const updateData = JSON.parse(updateResponse.content[0].text);
    expect(updateData.success).toBe(true);
    expect(updateData.result.updatedDecisionNodeIds).toEqual([
      "dec-update-test",
    ]);
    expect(updateData.result.updatedStepNodeIds).toEqual(["step-update-test"]);
  });

  it("fails closed in real mode when no explicit Account identity is configured", async () => {
    const previousMcpIdentity = process.env.KAGELIN_MCP_USER_ID;
    const previousLocalIdentity = process.env.NEXT_PUBLIC_LOCAL_USER_ID;
    delete process.env.KAGELIN_MCP_USER_ID;
    delete process.env.NEXT_PUBLIC_LOCAL_USER_ID;

    try {
      const realServer = createKagelinMcpServer({ useMockFallback: false });
      const response = await (
        realServer as any
      )._registeredTools.list_workspaces.handler({});

      expect(response.isError).toBe(true);
      expect(errorCategory(response)).toBe("authentication");
    } finally {
      if (previousMcpIdentity === undefined) {
        delete process.env.KAGELIN_MCP_USER_ID;
      } else {
        process.env.KAGELIN_MCP_USER_ID = previousMcpIdentity;
      }
      if (previousLocalIdentity === undefined) {
        delete process.env.NEXT_PUBLIC_LOCAL_USER_ID;
      } else {
        process.env.NEXT_PUBLIC_LOCAL_USER_ID = previousLocalIdentity;
      }
    }
  });

  it("keeps Workspace, node, and Connection reads account-scoped", async () => {
    const foreignNode = {
      ...mockNodes[1],
      id: "foreign-node",
      user_id: "user-2",
    };
    const scopedServer = createKagelinMcpServer({
      useMockFallback: true,
      identity: "user-1",
      initialWorkspaces: [...mockWorkspaces],
      initialNodes: [...mockNodes, foreignNode],
      initialEdges: [],
    });
    const getTool = (scopedServer as any)._registeredTools
      .get_workspace_blueprint;
    const listTool = (scopedServer as any)._registeredTools.list_workspaces;

    const getResponse = await getTool.handler({ workspaceId: "ws-1" });
    expect(getResponse.isError).toBe(true);
    expect(errorCategory(getResponse)).toBe("authorization");

    const listResponse = await listTool.handler({});
    const list = responseData(listResponse);
    expect(list.workspaces[0].nodeCount).toBe(2);

    const foreignEdge: WorkspaceEdge = {
      id: "foreign-edge",
      workspace_id: "ws-1",
      user_id: "user-2",
      source_node_id: "group-1",
      target_node_id: "node-doc-1",
      label: null,
      source_handle: null,
      target_handle: null,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    };
    const edgeScopedServer = createKagelinMcpServer({
      useMockFallback: true,
      identity: "user-1",
      initialWorkspaces: [...mockWorkspaces],
      initialNodes: [...mockNodes],
      initialEdges: [foreignEdge],
    });
    const edgeResponse = await (
      edgeScopedServer as any
    )._registeredTools.get_workspace_blueprint.handler({ workspaceId: "ws-1" });
    expect(errorCategory(edgeResponse)).toBe("authorization");
  });

  it("rejects cross-Account Workspace and domain references before any build write", async () => {
    const foreignWorkspace = {
      ...mockWorkspaces[0],
      id: "ws-foreign",
      user_id: "user-2",
    };
    const foreignTask = {
      ...mockTasks[0],
      id: "task-foreign",
      user_id: "user-2",
    };
    const scopedServer = createKagelinMcpServer({
      useMockFallback: true,
      identity: "user-1",
      initialWorkspaces: [foreignWorkspace],
      initialTasks: [foreignTask],
    });
    const getTool = (scopedServer as any)._registeredTools
      .get_workspace_blueprint;
    const buildTool = (scopedServer as any)._registeredTools.build_workspace;

    const workspaceResponse = await getTool.handler({
      workspaceId: "ws-foreign",
    });
    expect(errorCategory(workspaceResponse)).toBe("authorization");

    const buildResponse = await buildTool.handler({
      blueprint: {
        name: "Cross account reference",
        sections: [
          {
            id: "section",
            title: "Section",
            items: [
              {
                id: "foreign-task-node",
                kind: "task",
                content: "Should not be written",
                existingTaskId: "task-foreign",
              },
            ],
          },
        ],
      },
    });
    expect(errorCategory(buildResponse)).toBe("authorization");

    const listResponse = await (
      scopedServer as any
    )._registeredTools.list_workspaces.handler({});
    expect(responseData(listResponse).workspaces).toHaveLength(0);
  });

  it("rejects unsupported event nodes and invalid/self/duplicate connections before creating a Workspace", async () => {
    const buildTool = (mcpServer as any)._registeredTools.build_workspace;
    const listTool = (mcpServer as any)._registeredTools.list_workspaces;
    const initialCount = responseData(await listTool.handler({})).workspaces
      .length;

    const eventResponse = await buildTool.handler({
      blueprint: {
        name: "Unsupported event",
        sections: [
          {
            id: "section",
            title: "Section",
            items: [{ id: "event", kind: "event", title: "Calendar event" }],
          },
        ],
      } as unknown as WorkspaceBlueprint,
    });
    expect(errorCategory(eventResponse)).toBe("unsupported_operation");

    const invalidPortResponse = await buildTool.handler({
      blueprint: {
        name: "Invalid port",
        sections: [
          {
            id: "section",
            title: "Section",
            items: [{ id: "a", kind: "doc", title: "A", content: "" }],
          },
        ],
        flows: [{ fromItemId: "a", toItemId: "a", fromPort: "side" }],
      } as unknown as WorkspaceBlueprint,
    });
    expect(errorCategory(invalidPortResponse)).toBe("invalid_input");

    const duplicateConnectionResponse = await buildTool.handler({
      blueprint: {
        name: "Duplicate connections",
        sections: [
          {
            id: "section",
            title: "Section",
            items: [
              { id: "a", kind: "doc", title: "A", content: "" },
              { id: "b", kind: "doc", title: "B", content: "" },
            ],
          },
        ],
        flows: [
          { fromItemId: "a", toItemId: "b" },
          { fromItemId: "a", toItemId: "b" },
        ],
      },
    });
    expect(errorCategory(duplicateConnectionResponse)).toBe("invalid_input");

    const finalCount = responseData(await listTool.handler({})).workspaces
      .length;
    expect(finalCount).toBe(initialCount);
  });

  it("requires explicit confirmation for removals and never deletes the referenced domain entity", async () => {
    const buildTool = (mcpServer as any)._registeredTools.build_workspace;
    const patchTool = (mcpServer as any)._registeredTools.patch_workspace;
    const buildResponse = await buildTool.handler({
      blueprint: {
        name: "Removal guardrail",
        sections: [
          {
            id: "section",
            title: "Section",
            items: [
              {
                id: "task-node",
                kind: "task",
                content: "Existing task",
                existingTaskId: "task-1",
              },
            ],
          },
        ],
      },
    });
    const built = responseData(buildResponse);

    const rejectedResponse = await patchTool.handler({
      patch: {
        workspaceId: built.workspaceId,
        removeNodeIds: [built.itemNodeIds["task-node"]],
      },
    });
    expect(errorCategory(rejectedResponse)).toBe("confirmation_required");

    const confirmedResponse = await patchTool.handler({
      patch: {
        workspaceId: built.workspaceId,
        removeNodeIds: [built.itemNodeIds["task-node"]],
        destructiveConfirmation: true,
      },
    });
    expect(responseData(confirmedResponse).removedNodeIds).toContain(
      built.itemNodeIds["task-node"],
    );

    const contextResponse = await (
      mcpServer as any
    )._registeredTools.inspect_app_context.handler({
      entityKind: "task",
    });
    expect(responseData(contextResponse).recentTasks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "task-1" })]),
    );
  });

  it("replays the same request ID without duplicate writes and rejects conflicting reuse", async () => {
    const buildTool = (mcpServer as any)._registeredTools.build_workspace;
    const patchTool = (mcpServer as any)._registeredTools.patch_workspace;
    const blueprint: WorkspaceBlueprint = {
      name: "Retry-safe workspace",
      sections: [
        {
          id: "section",
          title: "Section",
          items: [{ id: "doc", kind: "doc", title: "Doc", content: "Text" }],
        },
      ],
    };

    const firstResponse = await buildTool.handler({
      requestId: "retry-1",
      blueprint,
    });
    const replayResponse = await buildTool.handler({
      requestId: "retry-1",
      blueprint: { ...blueprint, sections: [...blueprint.sections] },
    });
    const first = responseData(firstResponse);
    const replay = responseData(replayResponse);
    expect(first.status).toBe("succeeded");
    expect(replay.status).toBe("replayed");
    expect(replay.replayed).toBe(true);
    expect(replay.workspaceId).toBe(first.workspaceId);

    const newResponse = await buildTool.handler({
      requestId: "retry-2",
      blueprint,
    });
    expect(responseData(newResponse).workspaceId).not.toBe(first.workspaceId);

    const conflictingResponse = await buildTool.handler({
      requestId: "retry-1",
      blueprint: { ...blueprint, name: "Different input" },
    });
    expect(errorCategory(conflictingResponse)).toBe("request_conflict");

    const crossOperationResponse = await patchTool.handler({
      requestId: "retry-1",
      patch: {
        workspaceId: "ws-1",
        updateDocs: [{ nodeId: "node-doc-1", content: "No write" }],
      },
    });
    expect(errorCategory(crossOperationResponse)).toBe("request_conflict");

    const patchInput = {
      requestId: "patch-retry-1",
      patch: {
        workspaceId: "ws-1",
        updateDocs: [{ nodeId: "node-doc-1", content: "Retry-safe edit" }],
      },
    };
    const firstPatchResponse = await patchTool.handler(patchInput);
    const replayPatchResponse = await patchTool.handler({
      requestId: patchInput.requestId,
      patch: { ...patchInput.patch },
    });
    expect(responseData(firstPatchResponse).status).toBe("succeeded");
    expect(responseData(replayPatchResponse).status).toBe("replayed");
    expect(responseData(replayPatchResponse).replayed).toBe(true);

    const workspaces = responseData(
      await (mcpServer as any)._registeredTools.list_workspaces.handler({}),
    ).workspaces;
    expect(workspaces).toHaveLength(3);
  });

  it("coalesces concurrent retries that use the same request ID", async () => {
    const buildTool = (mcpServer as any)._registeredTools.build_workspace;
    const blueprint: WorkspaceBlueprint = {
      name: "Concurrent retry workspace",
      sections: [
        {
          id: "section",
          title: "Section",
          items: [{ id: "doc", kind: "doc", title: "Doc", content: "Text" }],
        },
      ],
    };

    const [firstResponse, secondResponse] = await Promise.all([
      buildTool.handler({ requestId: "concurrent-1", blueprint }),
      buildTool.handler({ requestId: "concurrent-1", blueprint }),
    ]);
    const first = responseData(firstResponse);
    const second = responseData(secondResponse);
    expect(new Set([first.workspaceId, second.workspaceId])).toHaveLength(1);
    expect([first.status, second.status].sort()).toEqual([
      "replayed",
      "succeeded",
    ]);
    expect(
      responseData(
        await (mcpServer as any)._registeredTools.list_workspaces.handler({}),
      ).workspaces,
    ).toHaveLength(2);
  });
});
