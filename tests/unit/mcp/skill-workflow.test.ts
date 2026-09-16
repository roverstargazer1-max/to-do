import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createKagelinMcpServer } from "../../../mcp-server/server";

const skillPath = resolve(
  process.cwd(),
  "skills",
  "kagelin-workspace-builder",
  "SKILL.md",
);
const scenariosPath = resolve(
  process.cwd(),
  "skills",
  "kagelin-workspace-builder",
  "scenarios.json",
);

describe("kagelin-workspace-builder Skill contract", () => {
  const skill = readFileSync(skillPath, "utf8");
  const scenarios = JSON.parse(readFileSync(scenariosPath, "utf8")) as Array<{
    id: string;
    requiredToolOrder: string[];
    optionalVerification?: boolean;
    requiresUserConfirmation?: boolean;
    requiresClarification?: boolean;
    requiredMarker?: string;
  }>;

  it("has one model-invoked Skill with an independent compatible version", () => {
    expect(skill).toMatch(/^---\nname: kagelin-workspace-builder\n/);
    expect(skill).toMatch(/version: 1\.0\.0/);
    expect(skill).toMatch(/requires_mcp_contract: ">=1\.2\.0 <2\.0\.0"/);
  });

  it("defines creation and patch sequences in the right order", () => {
    const creation = skill.slice(
      skill.indexOf("## Create a new Workspace"),
      skill.indexOf("## Patch an existing Workspace"),
    );
    const patch = skill.slice(
      skill.indexOf("## Patch an existing Workspace"),
      skill.indexOf("## Handle tool results"),
    );

    expect(creation.indexOf("inspect_app_context")).toBeLessThan(
      creation.indexOf("build_workspace"),
    );
    expect(patch.indexOf("list_workspaces")).toBeLessThan(
      patch.indexOf("get_workspace_blueprint"),
    );
    expect(patch.indexOf("get_workspace_blueprint")).toBeLessThan(
      patch.indexOf("patch_workspace"),
    );
    expect(patch).toMatch(/never express a local change as a full/);
  });

  it("keeps safety and v1 semantic ownership in the Skill/MCP boundary", () => {
    expect(skill).toMatch(/Event nodes are outside this\s+contract/);
    expect(skill).toMatch(
      /Connections and typed Visual relations describe context only/,
    );
    expect(skill).toMatch(/destructiveConfirmation: true/);
    expect(skill).toMatch(/status: partial/);
    expect(skill).not.toMatch(
      /supabase\.from|workspaceMutations|nodeCommands|taskCommands/,
    );
  });

  it("provides review fixtures for reuse, topology choice, patching, and confirmation", () => {
    expect(scenarios).toHaveLength(5);
    for (const scenario of scenarios) {
      expect(scenario.id).toBeTruthy();
      expect(scenario.requiredToolOrder.length).toBeGreaterThan(0);
      expect(scenario.requiredToolOrder).toEqual(
        expect.arrayContaining(
          scenario.requiredToolOrder.filter((tool) =>
            [
              "list_workspaces",
              "inspect_app_context",
              "get_workspace_blueprint",
              "build_workspace",
              "patch_workspace",
            ].includes(tool),
          ),
        ),
      );
    }

    const removal = scenarios.find(
      (scenario) => scenario.id === "confirm-removal",
    );
    expect(removal?.requiresUserConfirmation).toBe(true);
    expect(removal?.requiredMarker).toBe("destructiveConfirmation");
    const ambiguous = scenarios.find(
      (scenario) => scenario.id === "ambiguous-existing-target",
    );
    expect(ambiguous?.requiresClarification).toBe(true);
  });

  it("can observe a target, apply a localized patch, and re-read preserved layout", async () => {
    const server = createKagelinMcpServer({
      useMockFallback: true,
      identity: "user-1",
      initialWorkspaces: [
        {
          id: "workflow-ws",
          user_id: "user-1",
          name: "Workflow",
          color: null,
          created_at: "2026-09-01T00:00:00Z",
          updated_at: "2026-09-01T00:00:00Z",
        },
      ] as any,
      initialNodes: [
        {
          id: "workflow-group",
          workspace_id: "workflow-ws",
          user_id: "user-1",
          kind: "group",
          entity_type: null,
          entity_id: null,
          position_x: 100,
          position_y: 120,
          width: 320,
          height: 240,
          group_id: null,
          display_config: { title: "Existing group" },
          created_at: "2026-09-01T00:00:00Z",
          updated_at: "2026-09-01T00:00:00Z",
        },
        {
          id: "workflow-doc",
          workspace_id: "workflow-ws",
          user_id: "user-1",
          kind: "doc",
          entity_type: null,
          entity_id: null,
          position_x: 32,
          position_y: 48,
          width: 280,
          height: 120,
          group_id: "workflow-group",
          display_config: { title: "Existing doc", content: "Keep me" },
          created_at: "2026-09-01T00:00:00Z",
          updated_at: "2026-09-01T00:00:00Z",
        },
      ] as any,
    });
    const calls: string[] = [];
    const tool = async (name: string, args: Record<string, unknown>) => {
      calls.push(name);
      return (server as any)._registeredTools[name].handler(args);
    };
    const read = (response: any) =>
      JSON.parse(response.content[0].text) as Record<string, any>;

    const listed = read(await tool("list_workspaces", {}));
    expect(listed.workspaces).toHaveLength(1);
    const before = read(
      await tool("get_workspace_blueprint", { workspaceId: "workflow-ws" }),
    );
    const beforeDoc = before.snapshot.groups[0].items.find(
      (item: any) => item.nodeId === "workflow-doc",
    );

    const patched = read(
      await tool("patch_workspace", {
        patch: {
          workspaceId: "workflow-ws",
          addItems: [
            {
              targetGroupId: "workflow-group",
              item: {
                id: "workflow-step",
                kind: "step",
                title: "Verify",
              },
            },
          ],
          updateDocs: [{ nodeId: "workflow-doc", content: "Updated in place" }],
        },
      }),
    );
    expect(patched.addedNodeIds).toContain("workflow-step");

    const after = read(
      await tool("get_workspace_blueprint", { workspaceId: "workflow-ws" }),
    );
    const afterDoc = after.snapshot.groups[0].items.find(
      (item: any) => item.nodeId === "workflow-doc",
    );
    expect(afterDoc.position).toEqual(beforeDoc.position);
    expect(afterDoc.width).toBe(beforeDoc.width);
    expect(afterDoc.content).toBe("Updated in place");
    expect(after.snapshot.groups[0].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: "workflow-step" }),
      ]),
    );
    expect(calls).toEqual([
      "list_workspaces",
      "get_workspace_blueprint",
      "patch_workspace",
      "get_workspace_blueprint",
    ]);
  });
});
