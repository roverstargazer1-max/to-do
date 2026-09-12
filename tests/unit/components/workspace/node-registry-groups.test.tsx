import { describe, it, expect } from "vitest";
import {
  getNodeKindSpec,
  resolveNodeKind,
  toWorkspaceFlowNodes,
  UNKNOWN_NODE_KIND,
} from "@/components/workspace/node-registry";
import type { WorkspaceNode } from "@/lib/types/workspace";

const makeGroupRow = (
  overrides: Partial<WorkspaceNode> = {},
): WorkspaceNode => ({
  id: "group-1",
  workspace_id: "ws-1",
  user_id: "guest",
  kind: "group",
  entity_type: null,
  entity_id: null,
  position_x: 100,
  position_y: 200,
  width: 400,
  height: 300,
  group_id: null,
  display_config: { title: "Sprint Goals" },
  created_at: "2026-09-11T00:00:00.000Z",
  updated_at: "2026-09-11T00:00:00.000Z",
  ...overrides,
});

const makeTaskRow = (
  overrides: Partial<WorkspaceNode> = {},
): WorkspaceNode => ({
  id: "node-1",
  workspace_id: "ws-1",
  user_id: "guest",
  kind: "task",
  entity_type: "task",
  entity_id: "task-1",
  position_x: 20,
  position_y: 50,
  width: 260,
  height: null,
  group_id: null,
  display_config: null,
  created_at: "2026-09-11T00:00:00.000Z",
  updated_at: "2026-09-11T00:00:00.000Z",
  ...overrides,
});

describe("group node registry & flow-node translation", () => {
  it("registers group kind spec with defaults, component, and schema", () => {
    const spec = getNodeKindSpec("group");
    expect(spec).toBeDefined();
    expect(spec?.kind).toBe("group");
    expect(spec?.defaults).toEqual({ width: 360, height: 240 });
    expect(spec?.component).toBeDefined();
    expect(spec?.schema).toBeDefined();
  });

  it("resolves a well-formed group row", () => {
    const row = makeGroupRow();
    expect(resolveNodeKind(row).kind).toBe("group");
  });

  it("degrades a group row with entity references to unknown", () => {
    const row = makeGroupRow({ entity_type: "task", entity_id: "task-1" });
    expect(resolveNodeKind(row).kind).toBe(UNKNOWN_NODE_KIND);
  });

  it("sorts container nodes before member nodes to preserve DOM z-order", () => {
    // In input array, member node comes BEFORE group node
    const member = makeTaskRow({ id: "child-1", group_id: "group-1" });
    const group = makeGroupRow({ id: "group-1" });

    const flowNodes = toWorkspaceFlowNodes([member, group]);

    // Container must be ordered first in the derived flow nodes
    expect(flowNodes[0].id).toBe("group-1");
    expect(flowNodes[0].type).toBe("group");
    expect(flowNodes[1].id).toBe("child-1");
    expect(flowNodes[1].type).toBe("task");
  });

  it("assigns parentId without expandParent to member nodes whose group exists", () => {
    const member1 = makeTaskRow({
      id: "child-1",
      group_id: "group-1",
      position_x: 20,
      position_y: 50,
    });
    const member2 = makeTaskRow({
      id: "child-2",
      group_id: "group-1",
      position_x: 100,
      position_y: 120,
    });
    const group = makeGroupRow({ id: "group-1" });

    const flowNodes = toWorkspaceFlowNodes([member1, group, member2]);

    const child1Node = flowNodes.find((n) => n.id === "child-1")!;
    const child2Node = flowNodes.find((n) => n.id === "child-2")!;
    const groupNode = flowNodes.find((n) => n.id === "group-1")!;

    expect(child1Node.parentId).toBe("group-1");
    expect(child1Node.expandParent).toBeUndefined();
    expect(child2Node.parentId).toBe("group-1");
    expect(child2Node.expandParent).toBeUndefined();

    expect(groupNode.parentId).toBeUndefined();
    expect(groupNode.expandParent).toBeUndefined();
  });

  it("does not set parentId if the group does not exist in the node set", () => {
    const orphanMember = makeTaskRow({
      id: "orphan-1",
      group_id: "non-existent-group",
    });

    const flowNodes = toWorkspaceFlowNodes([orphanMember]);
    expect(flowNodes[0].parentId).toBeUndefined();
    expect(flowNodes[0].expandParent).toBeUndefined();
  });

  it("assigns explicit width and height styles to group node", () => {
    const group = makeGroupRow({ id: "group-1", width: 500, height: 350 });
    const flowNodes = toWorkspaceFlowNodes([group]);

    expect(flowNodes[0].style).toEqual({
      width: 500,
      height: 350,
    });
  });
});
