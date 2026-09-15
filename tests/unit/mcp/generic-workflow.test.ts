import { describe, expect, it } from "vitest";
import { createKagelinMcpServer } from "../../../mcp-server/server";

function readResult(response: any): Record<string, any> {
  return JSON.parse(response.content[0].text) as Record<string, any>;
}

describe("generic MCP Workspace workflow", () => {
  it("exposes one compact named workflow prompt", async () => {
    const server = createKagelinMcpServer({ useMockFallback: true });
    const prompt = (server as any)._registeredPrompts
      .workspace_builder_workflow;

    expect(prompt).toBeDefined();
    const result = await prompt.callback({});
    expect(result.messages[0].content.text).toContain("inspect_app_context");
    expect(result.messages[0].content.text).toContain(
      "get_workspace_blueprint",
    );
    expect(result.messages[0].content.text).toContain(
      "destructiveConfirmation",
    );
    expect(result.messages[0].content.text).toContain(
      "Event nodes are unsupported",
    );
  });

  it("completes a basic create and patch flow using only the generic MCP surface", async () => {
    const server = createKagelinMcpServer({ useMockFallback: true });
    const calls: string[] = [];
    const call = async (name: string, args: Record<string, unknown>) => {
      calls.push(name);
      return (server as any)._registeredTools[name].handler(args);
    };

    await call("inspect_app_context", { limit: 10 });
    const buildResponse = readResult(
      await call("build_workspace", {
        requestId: "generic-create-1",
        blueprint: {
          name: "Generic workflow",
          sections: [
            {
              id: "section",
              title: "Section",
              items: [
                {
                  id: "doc",
                  kind: "doc",
                  title: "Original",
                  content: "Keep layout",
                },
              ],
            },
          ],
        },
      }),
    );
    expect(buildResponse.success).toBe(true);

    const listed = readResult(await call("list_workspaces", {}));
    expect(listed.workspaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: buildResponse.workspaceId }),
      ]),
    );
    const before = readResult(
      await call("get_workspace_blueprint", {
        workspaceId: buildResponse.workspaceId,
      }),
    );
    const nodeId = buildResponse.itemNodeIds.doc;
    const patchResponse = readResult(
      await call("patch_workspace", {
        requestId: "generic-patch-1",
        patch: {
          workspaceId: buildResponse.workspaceId,
          updateDocs: [{ nodeId, content: "Updated through generic MCP" }],
        },
      }),
    );
    expect(patchResponse.success).toBe(true);
    const after = readResult(
      await call("get_workspace_blueprint", {
        workspaceId: buildResponse.workspaceId,
      }),
    );
    const beforeDoc = before.snapshot.standaloneItems.find(
      (item: any) => item.nodeId === nodeId,
    );
    const afterDoc = after.snapshot.standaloneItems.find(
      (item: any) => item.nodeId === nodeId,
    );
    expect(afterDoc.content).toBe("Updated through generic MCP");
    expect(afterDoc.position).toEqual(beforeDoc.position);
    expect(calls).toEqual([
      "inspect_app_context",
      "build_workspace",
      "list_workspaces",
      "get_workspace_blueprint",
      "patch_workspace",
      "get_workspace_blueprint",
    ]);
  });
});
