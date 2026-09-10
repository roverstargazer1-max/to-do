import { describe, it, expect } from "vitest";
import { toWorkspaceFlowEdges } from "@/components/workspace/edge-projection";
import type { WorkspaceEdge } from "@/lib/types/workspace";

/**
 * The edge projection (ADR 0021) — the read boundary where persisted
 * connection rows become React Flow edges.
 *
 * The behaviour under test is orphan derivation: an edge is drawn only
 * when BOTH of its endpoints are in the node set on screen. The two
 * queries land independently, so the node set can already have lost an
 * endpoint the edge set still lists; a line to a node that is gone must
 * never be drawn, exactly as an orphan node never renders its entity.
 */

const makeEdge = (overrides: Partial<WorkspaceEdge> = {}): WorkspaceEdge => ({
  id: "edge-1",
  workspace_id: "ws-1",
  user_id: "guest",
  source_node_id: "node-a",
  target_node_id: "node-b",
  created_at: "2026-09-10T00:00:00.000Z",
  updated_at: "2026-09-10T00:00:00.000Z",
  ...overrides,
});

describe("toWorkspaceFlowEdges", () => {
  it("translates a row into a flow edge carrying the connection's identity", () => {
    const [edge] = toWorkspaceFlowEdges(
      [makeEdge()],
      ["node-a", "node-b", "node-c"],
    );

    expect(edge.id).toBe("edge-1");
    expect(edge.source).toBe("node-a");
    expect(edge.target).toBe("node-b");
    expect(edge.type).toBe("default");
    // What a cut needs travels with the edge: its id, and the workspace it
    // belongs to. The row itself does not.
    expect(edge.data).toEqual({ edgeId: "edge-1", workspaceId: "ws-1" });
  });

  it("keeps the two directions of a pair apart — A → B is not B → A", () => {
    const edges = toWorkspaceFlowEdges(
      [
        makeEdge(),
        makeEdge({
          id: "edge-2",
          source_node_id: "node-b",
          target_node_id: "node-a",
        }),
      ],
      ["node-a", "node-b"],
    );

    expect(edges.map((edge) => [edge.source, edge.target])).toEqual([
      ["node-a", "node-b"],
      ["node-b", "node-a"],
    ]);
  });

  it("drops a connection whose source is no longer on the canvas", () => {
    const edges = toWorkspaceFlowEdges([makeEdge()], ["node-b", "node-c"]);

    expect(edges).toEqual([]);
  });

  it("drops a connection whose target is no longer on the canvas", () => {
    const edges = toWorkspaceFlowEdges([makeEdge()], ["node-a", "node-c"]);

    expect(edges).toEqual([]);
  });

  it("drops a connection whose endpoints both vanished, and keeps the rest", () => {
    const edges = toWorkspaceFlowEdges(
      [
        makeEdge({ id: "orphan-both" }),
        makeEdge({
          id: "survivor",
          source_node_id: "node-c",
          target_node_id: "node-d",
        }),
      ],
      ["node-c", "node-d"],
    );

    expect(edges.map((edge) => edge.id)).toEqual(["survivor"]);
  });

  it("projects an empty canvas — and an absent section — to no edges", () => {
    expect(toWorkspaceFlowEdges([], ["node-a"])).toEqual([]);
    expect(toWorkspaceFlowEdges([], [])).toEqual([]);
  });
});
