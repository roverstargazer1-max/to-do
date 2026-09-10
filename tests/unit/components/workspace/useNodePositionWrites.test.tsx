import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";

/**
 * Layer 3 of the three-layer drag model (ADR 0018): the debounced
 * row-level position PATCH, executed as the `node.move` mutation. The
 * externally visible behavior:
 *   - repeat drag-stops inside the window collapse into one write that
 *     carries the final position;
 *   - offline, a node holds at most one queued (paused) position write —
 *     a new write replaces the stale parked one; other nodes' writes
 *     wait untouched;
 *   - when the connection returns, the queued write lands and the
 *     node.moved fact publishes after the write, never before.
 */

const updateNodePosition = vi.hoisted(() => vi.fn(async () => {}));
const busEvents = vi.hoisted(() => ({ events: [] as unknown[] }));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ isGuestMode: true }),
}));

vi.mock("@/lib/mutations/workspace", () => ({
  workspaceMutations: {
    list: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
    listNodes: vi.fn(),
    addNode: vi.fn(),
    updateNodePosition: updateNodePosition,
    removeNode: vi.fn(),
  },
}));

vi.mock("@/lib/events/domain-bus", () => ({
  publishDomainEvent: (event: unknown) => busEvents.events.push(event),
}));

vi.mock("@/lib/notify", () => {
  const fn = vi.fn();
  return {
    notify: Object.assign(fn, {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
      loading: vi.fn(),
      dismiss: vi.fn(),
      promise: vi.fn(),
    }),
  };
});

import { useNodePositionWrites } from "@/components/workspace/useNodePositionWrites";
import type { MoveNodeInput } from "@/lib/types/workspace";

/** The queued write the probe fires; tests swap it per assertion. */
let nextWrite: MoveNodeInput = {
  workspaceId: "ws-1",
  nodeId: "node-a",
  position: { x: 0, y: 0 },
};

function Probe() {
  const { queuePositionWrite } = useNodePositionWrites();
  return (
    <button
      type="button"
      data-testid="queue-write"
      onClick={() => queuePositionWrite(nextWrite)}
    />
  );
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderProbe(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
}

const pausedNodeMoves = (queryClient: QueryClient, nodeId: string) =>
  queryClient
    .getMutationCache()
    .findAll({
      predicate: (mutation) =>
        Array.isArray(mutation.options.mutationKey) &&
        mutation.options.mutationKey[0] === "node.move" &&
        (mutation.state.variables as MoveNodeInput | undefined)?.nodeId ===
          nodeId,
    })
    .filter((mutation) => mutation.state.isPaused);

describe("useNodePositionWrites", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    busEvents.events = [];
    updateNodePosition.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    onlineManager.setOnline(true);
  });

  it("collapses repeat drag-stops into one write carrying the final position", async () => {
    const queryClient = makeQueryClient();
    renderProbe(queryClient);

    // Two drag-stops inside the debounce window.
    nextWrite = {
      workspaceId: "ws-1",
      nodeId: "node-a",
      position: { x: 100, y: 100 },
    };
    fireEvent.click(screen.getByTestId("queue-write"));
    await vi.advanceTimersByTimeAsync(200);
    nextWrite = {
      workspaceId: "ws-1",
      nodeId: "node-a",
      position: { x: 320, y: 480 },
    };
    fireEvent.click(screen.getByTestId("queue-write"));

    // Nothing persisted while the (restarted) window is still open.
    await vi.advanceTimersByTimeAsync(200);
    expect(updateNodePosition).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    expect(updateNodePosition).toHaveBeenCalledTimes(1);
    expect(updateNodePosition).toHaveBeenCalledWith("node-a", {
      x: 320,
      y: 480,
    });
    expect(busEvents.events).toEqual([
      { type: "node.moved", workspaceId: "ws-1", nodeId: "node-a" },
    ]);
  });

  it("offline, a dragged node holds at most one queued position write — the write with the final position", async () => {
    onlineManager.setOnline(false);
    const queryClient = makeQueryClient();
    renderProbe(queryClient);

    // First drag parks a paused write.
    nextWrite = {
      workspaceId: "ws-1",
      nodeId: "node-a",
      position: { x: 10, y: 10 },
    };
    fireEvent.click(screen.getByTestId("queue-write"));
    await vi.advanceTimersByTimeAsync(400);
    expect(pausedNodeMoves(queryClient, "node-a")).toHaveLength(1);
    // Nothing lands and nothing publishes while paused.
    expect(updateNodePosition).not.toHaveBeenCalled();
    expect(busEvents.events).toEqual([]);

    // A second drag of the same node replaces the parked write.
    nextWrite = {
      workspaceId: "ws-1",
      nodeId: "node-a",
      position: { x: 55, y: 66 },
    };
    fireEvent.click(screen.getByTestId("queue-write"));
    await vi.advanceTimersByTimeAsync(400);

    const parked = pausedNodeMoves(queryClient, "node-a");
    expect(parked).toHaveLength(1);
    expect((parked[0].state.variables as MoveNodeInput).position).toEqual({
      x: 55,
      y: 66,
    });
  });

  it("the offline dedup never touches another node's queued write", async () => {
    onlineManager.setOnline(false);
    const queryClient = makeQueryClient();
    renderProbe(queryClient);

    // Node B parks a write.
    nextWrite = {
      workspaceId: "ws-1",
      nodeId: "node-b",
      position: { x: 7, y: 7 },
    };
    fireEvent.click(screen.getByTestId("queue-write"));
    await vi.advanceTimersByTimeAsync(400);
    expect(pausedNodeMoves(queryClient, "node-b")).toHaveLength(1);

    // Node A drags twice — only node A's parked writes churn.
    nextWrite = {
      workspaceId: "ws-1",
      nodeId: "node-a",
      position: { x: 10, y: 10 },
    };
    fireEvent.click(screen.getByTestId("queue-write"));
    await vi.advanceTimersByTimeAsync(400);
    nextWrite = {
      workspaceId: "ws-1",
      nodeId: "node-a",
      position: { x: 20, y: 20 },
    };
    fireEvent.click(screen.getByTestId("queue-write"));
    await vi.advanceTimersByTimeAsync(400);

    expect(pausedNodeMoves(queryClient, "node-b")).toHaveLength(1);
    expect(pausedNodeMoves(queryClient, "node-a")).toHaveLength(1);
  });

  it("on reconnect the queued write lands, and node.moved publishes after the write lands", async () => {
    onlineManager.setOnline(false);
    const queryClient = makeQueryClient();
    renderProbe(queryClient);

    nextWrite = {
      workspaceId: "ws-1",
      nodeId: "node-a",
      position: { x: 55, y: 66 },
    };
    fireEvent.click(screen.getByTestId("queue-write"));
    await vi.advanceTimersByTimeAsync(400);
    expect(updateNodePosition).not.toHaveBeenCalled();

    // Back online: the parked write resumes and lands.
    onlineManager.setOnline(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(updateNodePosition).toHaveBeenCalledTimes(1);
    expect(updateNodePosition).toHaveBeenCalledWith("node-a", {
      x: 55,
      y: 66,
    });
    expect(busEvents.events).toEqual([
      { type: "node.moved", workspaceId: "ws-1", nodeId: "node-a" },
    ]);
  });
});
