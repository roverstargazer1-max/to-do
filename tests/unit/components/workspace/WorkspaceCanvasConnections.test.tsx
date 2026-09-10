import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The canvas's *connection* wiring (ADR 0021), asserted without React Flow
 * internals — the same technique the existing canvas suite uses: @xyflow/react
 * is replaced with a lightweight fake that echoes the edges it is handed and
 * fires the connection callbacks from buttons, so these tests observe the
 * component ↔ command wiring and never React Flow.
 *
 * The scenarios are the connection layer's whole contract:
 *   - a stored row is drawn between its two nodes;
 *   - drawing a connection draws it immediately, and the id the store is
 *     asked to write is *that* edge's id (so nothing remounts when the row
 *     comes back);
 *   - cutting a connection removes it from the canvas, the cache and the
 *     store, in that order;
 *   - a refused write surfaces the failure and leaves no fact behind;
 *   - a self-loop and an already-connected pair never reach the store.
 */

const hoisted = vi.hoisted(() => ({
  storedEdge: {
    id: "edge-1",
    workspace_id: "ws-a",
    user_id: "guest",
    source_node_id: "node-a",
    target_node_id: "node-b",
    created_at: "2026-09-10T00:00:00.000Z",
    updated_at: "2026-09-10T00:00:00.000Z",
  },
  nodeRows: { rows: [] as unknown[] },
  edgeRows: { rows: [] as unknown[] },
  addEdge: vi.fn(async () => {}),
  removeEdge: vi.fn(async () => {}),
  busEvents: { events: [] as unknown[] },
  notifyError: vi.fn(),
}));

vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  const { useState, useCallback } = React;
  return {
    useNodesState: (initial: unknown[]) => {
      const [nodes, setNodes] = useState(initial);
      const onNodesChange = useCallback(() => {}, []);
      return [nodes, setNodes, onNodesChange];
    },
    ReactFlow: ({
      edges,
      onConnect,
      onEdgesChange,
      onEdgesDelete,
      isValidConnection,
      children,
    }: {
      edges?: { id: string }[];
      onConnect?: (connection: {
        source: string | null;
        target: string | null;
      }) => void;
      onEdgesChange?: (changes: unknown[]) => void;
      onEdgesDelete?: (edges: unknown[]) => void;
      isValidConnection?: (connection: {
        source: string;
        target: string;
      }) => boolean;
      children?: React.ReactNode;
    }) => (
      <div
        data-testid="react-flow"
        data-edges={JSON.stringify(edges ?? [])}
        data-valid-self={String(
          isValidConnection?.({ source: "node-a", target: "node-a" }),
        )}
        data-valid-new-pair={String(
          isValidConnection?.({ source: "node-a", target: "node-b" }),
        )}
      >
        <button
          type="button"
          data-testid="simulate-connect"
          onClick={() => onConnect?.({ source: "node-a", target: "node-b" })}
        >
          draw a connection
        </button>
        <button
          type="button"
          data-testid="simulate-cut"
          onClick={() => {
            // React Flow fires both together on a keyboard delete: the
            // change carries the view state, the delete carries the rows.
            onEdgesChange?.([{ id: hoisted.storedEdge.id, type: "remove" }]);
            onEdgesDelete?.([
              {
                id: hoisted.storedEdge.id,
                source: hoisted.storedEdge.source_node_id,
                target: hoisted.storedEdge.target_node_id,
                data: { edgeId: hoisted.storedEdge.id, workspaceId: "ws-a" },
              },
            ]);
          }}
        >
          cut the connection
        </button>
        {children}
      </div>
    ),
    Background: () => null,
    BackgroundVariant: { Dots: "dots", Lines: "lines", Cross: "cross" },
    Controls: () => null,
  };
});

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ isGuestMode: true }),
}));

vi.mock("@/lib/mutations/workspace", () => ({
  workspaceMutations: {
    list: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
    listNodes: vi.fn(async () => hoisted.nodeRows.rows),
    addNode: vi.fn(),
    listEdges: vi.fn(async () => hoisted.edgeRows.rows),
    addEdge: hoisted.addEdge,
    removeEdge: hoisted.removeEdge,
    updateNodePosition: vi.fn(),
    removeNode: vi.fn(),
  },
}));

vi.mock("@/lib/events/domain-bus", () => ({
  publishDomainEvent: (event: unknown) => hoisted.busEvents.events.push(event),
}));

vi.mock("@/lib/notify", () => {
  const fn = vi.fn();
  return {
    notify: Object.assign(fn, {
      success: vi.fn(),
      error: hoisted.notifyError,
      warning: vi.fn(),
      info: vi.fn(),
      loading: vi.fn(),
      dismiss: vi.fn(),
      promise: vi.fn(),
    }),
  };
});

import { WorkspaceCanvas } from "@/components/workspace/WorkspaceCanvas";
import { workspaceKeys } from "@/lib/queries/workspace-keys";
import type { WorkspaceEdge, WorkspaceNode } from "@/lib/types/workspace";

const makeNode = (id: string): WorkspaceNode => ({
  id,
  workspace_id: "ws-a",
  user_id: "guest",
  kind: "task",
  entity_type: "task",
  entity_id: `task-${id}`,
  position_x: 0,
  position_y: 0,
  width: 260,
  height: null,
  display_config: null,
  created_at: "2026-09-10T00:00:00.000Z",
  updated_at: "2026-09-10T00:00:00.000Z",
});

function renderCanvas(workspaceId = "ws-a") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceCanvas workspaceId={workspaceId} />
    </QueryClientProvider>,
  );
  return { queryClient, ...utils };
}

const canvas = () => screen.getByTestId("react-flow");
const drawnEdges = () =>
  JSON.parse(canvas().getAttribute("data-edges") ?? "[]") as {
    id: string;
    source: string;
    target: string;
  }[];

beforeEach(() => {
  hoisted.nodeRows.rows = [makeNode("node-a"), makeNode("node-b")];
  hoisted.edgeRows.rows = [];
  hoisted.busEvents.events = [];
  hoisted.notifyError.mockClear();
  hoisted.addEdge.mockClear();
  hoisted.removeEdge.mockClear();
  // Implementations are restored by hand: the suite's `clearMocks` drops
  // recorded calls, not behaviour, and one test parks a never-resolving
  // write on purpose.
  hoisted.addEdge.mockImplementation(async () => {});
  hoisted.removeEdge.mockImplementation(async () => {});
});

describe("WorkspaceCanvas connections", () => {
  it("draws a stored connection between its two nodes", async () => {
    hoisted.edgeRows.rows = [hoisted.storedEdge];

    renderCanvas();

    await waitFor(() =>
      expect(drawnEdges().map((edge) => edge.id)).toContain("edge-1"),
    );
  });

  it("drawing a connection draws it immediately and persists that exact id", async () => {
    renderCanvas();
    await waitFor(() => expect(drawnEdges()).toEqual([]));

    fireEvent.click(screen.getByTestId("simulate-connect"));

    // Layer 2 — the line is already on the canvas.
    const drawn = drawnEdges();
    expect(drawn).toHaveLength(1);
    expect(drawn[0].source).toBe("node-a");
    expect(drawn[0].target).toBe("node-b");

    // Layer 3 — the store is asked to write the *drawn* edge's id, so the
    // confirmation cannot remount the line.
    await waitFor(() =>
      expect(hoisted.addEdge).toHaveBeenCalledWith({
        id: drawn[0].id,
        workspaceId: "ws-a",
        sourceNodeId: "node-a",
        targetNodeId: "node-b",
      }),
    );
  });

  it("drawing a connection does not depend on the store answering first", () => {
    // A store that never resolves is the slow-network case: the line still
    // appears the moment the user lets go.
    hoisted.addEdge.mockImplementation(() => new Promise(() => {}));

    renderCanvas();
    fireEvent.click(screen.getByTestId("simulate-connect"));

    expect(drawnEdges()).toHaveLength(1);
  });

  it("cutting a connection drops it from the canvas, the cache and the store", async () => {
    hoisted.edgeRows.rows = [hoisted.storedEdge];
    const { queryClient } = renderCanvas();
    await waitFor(() =>
      expect(drawnEdges().map((edge) => edge.id)).toContain("edge-1"),
    );
    // The cache holds the row the projection reads.
    queryClient.setQueryData(workspaceKeys.edges.list("ws-a", true), [
      hoisted.storedEdge,
    ]);

    fireEvent.click(screen.getByTestId("simulate-cut"));

    // Off the canvas at once…
    expect(drawnEdges()).toEqual([]);
    // …out of the cache, so a concurrent nodes refetch cannot resurrect it…
    expect(
      queryClient.getQueryData<WorkspaceEdge[]>(
        workspaceKeys.edges.list("ws-a", true),
      ),
    ).toEqual([]);
    // …and persisted, with the fact published after the write.
    await waitFor(() =>
      expect(hoisted.removeEdge).toHaveBeenCalledWith("edge-1"),
    );
    await waitFor(() =>
      expect(hoisted.busEvents.events).toContainEqual({
        type: "edge.removed",
        workspaceId: "ws-a",
        edgeId: "edge-1",
      }),
    );
  });

  it("a refused connection surfaces the failure and publishes no fact", async () => {
    hoisted.addEdge.mockRejectedValueOnce(new Error("write refused"));

    renderCanvas();
    fireEvent.click(screen.getByTestId("simulate-connect"));

    await waitFor(() =>
      expect(hoisted.notifyError).toHaveBeenCalledWith(
        "Failed to connect the nodes",
      ),
    );
    expect(hoisted.busEvents.events).toEqual([]);
  });

  it("refuses a self-loop, and a pair that is already connected", async () => {
    renderCanvas();

    // Nothing is connected yet: the pair is legal, the self-loop never is.
    expect(canvas().getAttribute("data-valid-self")).toBe("false");
    expect(canvas().getAttribute("data-valid-new-pair")).toBe("true");

    fireEvent.click(screen.getByTestId("simulate-connect"));

    // Now that A → B exists, redrawing it is a no-op.
    await waitFor(() =>
      expect(canvas().getAttribute("data-valid-new-pair")).toBe("false"),
    );
  });
});
