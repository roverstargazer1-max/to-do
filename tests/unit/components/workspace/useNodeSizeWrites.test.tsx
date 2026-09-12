import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";

const updateNodeSize = vi.hoisted(() => vi.fn(async () => {}));
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
    updateNodePosition: vi.fn(),
    updateNodeSize: updateNodeSize,
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

import { useNodeSizeWrites } from "@/components/workspace/useNodeSizeWrites";
import type { ResizeNodeInput } from "@/lib/types/workspace";

let nextWrite: ResizeNodeInput = {
  workspaceId: "ws-1",
  nodeId: "node-a",
  width: 300,
  height: 200,
};

function Probe() {
  const { queueSizeWrite } = useNodeSizeWrites();
  return (
    <button
      type="button"
      data-testid="queue-size-write"
      onClick={() => queueSizeWrite(nextWrite)}
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

describe("useNodeSizeWrites", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    busEvents.events = [];
    updateNodeSize.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    onlineManager.setOnline(true);
  });

  it("collapses repeat resize updates into one write carrying the final size", async () => {
    const queryClient = makeQueryClient();
    renderProbe(queryClient);

    nextWrite = {
      workspaceId: "ws-1",
      nodeId: "node-a",
      width: 300,
      height: 200,
    };
    fireEvent.click(screen.getByTestId("queue-size-write"));
    await vi.advanceTimersByTimeAsync(200);

    nextWrite = {
      workspaceId: "ws-1",
      nodeId: "node-a",
      width: 450,
      height: 350,
    };
    fireEvent.click(screen.getByTestId("queue-size-write"));

    await vi.advanceTimersByTimeAsync(200);
    expect(updateNodeSize).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    expect(updateNodeSize).toHaveBeenCalledTimes(1);
    expect(updateNodeSize).toHaveBeenCalledWith("node-a", {
      width: 450,
      height: 350,
    });
    expect(busEvents.events).toEqual([
      { type: "node.resized", workspaceId: "ws-1", nodeId: "node-a" },
    ]);
  });
});
