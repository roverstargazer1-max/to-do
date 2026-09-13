import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The declarative node-kind registry (ticket 05): the task kind registers
 * exactly once — kind, defaults, component, commands, schema — and every
 * derivation flows from that single registration: React Flow render
 * routing, row → flow-node translation, and read-boundary resolution.
 * Unknown kinds (and known kinds whose rows violate the kind's contract)
 * degrade to the placeholder, never an error. Removing a node never
 * touches the referenced task; re-adding it later is possible.
 */

const removeNode = vi.hoisted(() => vi.fn(async () => {}));
const addNode = vi.hoisted(() => vi.fn());
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
    addNode: addNode,
    updateNodePosition: vi.fn(),
    removeNode: removeNode,
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

import {
  getNodeKindSpec,
  resolveNodeKind,
  toWorkspaceFlowNodes,
  workspaceNodeTypes,
  UNKNOWN_NODE_KIND,
} from "@/components/workspace/node-registry";
import { taskCommands } from "@/lib/commands/task";
import { mockStore } from "@/lib/mock/mock-store";
import type { WorkspaceNode } from "@/lib/types/workspace";

const TASK_ID = "registry-task-1";

const makeRow = (overrides: Partial<WorkspaceNode> = {}): WorkspaceNode => ({
  id: "node-1",
  workspace_id: "ws-1",
  user_id: "guest",
  kind: "task",
  entity_type: "task",
  entity_id: TASK_ID,
  position_x: 12,
  position_y: 34,
  width: 260,
  height: null,
  display_config: null,
  created_at: "2026-09-09T00:00:00.000Z",
  updated_at: "2026-09-09T00:00:00.000Z",
  ...overrides,
});

function renderSpec(spec: { kind: string }, row: WorkspaceNode) {
  const Component = workspaceNodeTypes[spec.kind] as React.ComponentType<{
    id: string;
    data: { row: WorkspaceNode };
  }>;
  if (!Component) throw new Error("missing node type for kind " + spec.kind);
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <Component id={row.id} data={{ row }} />
    </QueryClientProvider>,
  );
}

describe("node-kind registry", () => {
  beforeEach(() => {
    localStorage.clear();
    mockStore.clearData();
    localStorage.setItem("kanso_guest_mode", "true");
    busEvents.events = [];
    removeNode.mockClear();
    addNode.mockClear();
  });

  it("registers the task kind once with kind, defaults, component, commands, schema", () => {
    const spec = getNodeKindSpec("task");
    expect(spec).toBeDefined();
    expect(spec?.kind).toBe("task");
    expect(spec?.defaults).toEqual({ width: 260, height: null });
    expect(spec?.component).toBeDefined();
    expect(Object.keys(spec?.commands ?? {})).toEqual(["add", "toggle"]);
    expect(spec?.schema).toBeDefined();
    // The checkbox binding is the same task command the tasks page uses.
    expect((spec?.commands as Record<string, unknown>).toggle).toBe(
      taskCommands.toggle,
    );
  });

  it("registers the habit kind once — add binding only (phase-1 asymmetry: check-in stays on the hook)", () => {
    const spec = getNodeKindSpec("habit");
    expect(spec).toBeDefined();
    expect(spec?.kind).toBe("habit");
    expect(spec?.defaults).toEqual({ width: 240, height: null });
    expect(spec?.component).toBeDefined();
    expect(Object.keys(spec?.commands ?? {})).toEqual(["add"]);
    expect(spec?.schema).toBeDefined();
  });

  it("registers the event kind once — add binding only (display-only kind)", () => {
    const spec = getNodeKindSpec("event");
    expect(spec).toBeDefined();
    expect(spec?.kind).toBe("event");
    expect(spec?.defaults).toEqual({ width: 240, height: null });
    expect(spec?.component).toBeDefined();
    expect(Object.keys(spec?.commands ?? {})).toEqual(["add"]);
    expect(spec?.schema).toBeDefined();
  });

  it("registers the focus kind once — add binding only, no entity reference", () => {
    const spec = getNodeKindSpec("focus");
    expect(spec).toBeDefined();
    expect(spec?.kind).toBe("focus");
    expect(spec?.defaults).toEqual({ width: 220, height: null });
    expect(spec?.component).toBeDefined();
    expect(Object.keys(spec?.commands ?? {})).toEqual(["add"]);
    expect(spec?.schema).toBeDefined();
  });

  it("registers the project kind once with kind, defaults, component, commands, schema", () => {
    const spec = getNodeKindSpec("project");
    expect(spec).toBeDefined();
    expect(spec?.kind).toBe("project");
    expect(spec?.defaults).toEqual({ width: 280, height: null });
    expect(spec?.component).toBeDefined();
    expect(Object.keys(spec?.commands ?? {})).toEqual(["add"]);
    expect(spec?.schema).toBeDefined();
  });

  it("resolves a well-formed task row to the task spec", () => {
    expect(resolveNodeKind(makeRow()).kind).toBe("task");
  });

  it("resolves well-formed habit, event, and focus rows to their specs", () => {
    expect(
      resolveNodeKind(
        makeRow({
          id: "node-h",
          kind: "habit",
          entity_type: "habit",
          entity_id: "habit-1",
        }),
      ).kind,
    ).toBe("habit");
    expect(
      resolveNodeKind(
        makeRow({
          id: "node-e",
          kind: "event",
          entity_type: "event",
          entity_id: "event-1",
        }),
      ).kind,
    ).toBe("event");
    // The focus kind's reference pair is null on both sides.
    expect(
      resolveNodeKind(
        makeRow({
          id: "node-f",
          kind: "focus",
          entity_type: null,
          entity_id: null,
        }),
      ).kind,
    ).toBe("focus");
    // The doc kind's reference pair is null on both sides.
    expect(
      resolveNodeKind(
        makeRow({
          id: "node-d",
          kind: "doc",
          entity_type: null,
          entity_id: null,
        }),
      ).kind,
    ).toBe("doc");
    expect(
      resolveNodeKind(
        makeRow({
          id: "node-p",
          kind: "project",
          entity_type: "project",
          entity_id: "project-1",
        }),
      ).kind,
    ).toBe("project");
  });

  it("degrades a doc row that carries an entity pair — the doc kind references nothing", () => {
    expect(
      resolveNodeKind(
        makeRow({
          id: "node-d-invalid",
          kind: "doc",
          entity_type: "doc" as unknown as null,
          entity_id: "doc-1" as unknown as null,
        }),
      ).kind,
    ).toBe(UNKNOWN_NODE_KIND);
  });

  it("degrades a focus row that carries an entity pair — the focus kind references nothing", () => {
    const row = makeRow({
      id: "node-f",
      kind: "focus",
      entity_type: "task",
      entity_id: TASK_ID,
    });
    expect(resolveNodeKind(row).kind).toBe(UNKNOWN_NODE_KIND);
  });

  it("degrades a habit row whose kind contract is violated", () => {
    const row = makeRow({
      id: "node-h",
      kind: "habit",
      entity_type: "event",
      entity_id: "event-1",
    });
    expect(resolveNodeKind(row).kind).toBe(UNKNOWN_NODE_KIND);
  });

  it("resolves an unknown kind to the placeholder — never an error", () => {
    const row = makeRow({ id: "node-x", kind: "kind-from-the-future" });
    expect(resolveNodeKind(row).kind).toBe(UNKNOWN_NODE_KIND);
  });

  it("degrades a known kind whose row violates the kind's contract", () => {
    // entity_id null: the task kind's soft-reference contract is broken.
    const row = makeRow({ entity_id: null, entity_type: null });
    expect(resolveNodeKind(row).kind).toBe(UNKNOWN_NODE_KIND);
  });

  it("derives flow nodes from the registration: id, position, routing, width", () => {
    const [taskFlow, sized, habitFlow, unknownFlow] = toWorkspaceFlowNodes([
      makeRow(),
      makeRow({ id: "node-2", width: 320 }),
      makeRow({
        id: "node-h",
        kind: "habit",
        entity_type: "habit",
        entity_id: "habit-1",
      }),
      makeRow({ id: "node-3", kind: "kind-from-the-future" }),
    ]);

    expect(taskFlow.id).toBe("node-1");
    expect(taskFlow.type).toBe("task");
    expect(taskFlow.position).toEqual({ x: 12, y: 34 });
    expect(taskFlow.data.row.kind).toBe("task");
    expect(taskFlow.style).toEqual({ width: 260 });

    expect(sized.style).toEqual({ width: 320 });

    expect(habitFlow.type).toBe("habit");

    expect(unknownFlow.type).toBe(UNKNOWN_NODE_KIND);
  });

  it("derives the React Flow render routing from the registration", () => {
    expect(Object.keys(workspaceNodeTypes).sort()).toEqual(
      [
        UNKNOWN_NODE_KIND,
        "doc",
        "event",
        "focus",
        "group",
        "habit",
        "project",
        "task",
      ].sort(),
    );
  });

  it("renders the placeholder for an unknown kind instead of throwing", () => {
    const row = makeRow({ id: "node-x", kind: "kind-from-the-future" });
    renderSpec({ kind: UNKNOWN_NODE_KIND }, row);

    expect(
      screen.getByText("Unsupported node (kind-from-the-future)"),
    ).toBeInTheDocument();
  });
});

describe("task node through the registry", () => {
  beforeEach(() => {
    localStorage.clear();
    mockStore.clearData();
    localStorage.setItem("kanso_guest_mode", "true");
    busEvents.events = [];
    removeNode.mockClear();
    addNode.mockClear();

    mockStore.addTask({
      id: TASK_ID,
      content: "Registry task",
      is_completed: false,
    });
  });

  it("renders the referenced task through the same queries the tasks page reads", async () => {
    const row = makeRow();
    renderSpec({ kind: "task" }, row);

    await waitFor(() =>
      expect(screen.getByText("Registry task")).toBeInTheDocument(),
    );
    expect(screen.getByTestId(`task-node-state-${TASK_ID}`)).toHaveTextContent(
      "active",
    );
  });

  it("removing a node leaves the underlying task untouched; re-adding it later is possible", async () => {
    const row = makeRow();
    renderSpec({ kind: "task" }, row);

    // Remove: a layout write only — the node row, never the task.
    removeNode.mockResolvedValue(undefined);
    fireEvent.click(screen.getByTestId(`task-node-remove-${TASK_ID}`));

    await vi.waitFor(() => {
      expect(removeNode).toHaveBeenCalledWith(row.id);
      expect(busEvents.events).toContainEqual({
        type: "node.removed",
        workspaceId: "ws-1",
        nodeId: row.id,
      });
    });
    // The task itself is untouched.
    expect(mockStore.getTasks().map((t) => t.id)).toEqual([TASK_ID]);

    // Re-adding is possible: the kind's add binding places a fresh node
    // row with the reference pair and the registry defaults.
    addNode.mockResolvedValue(makeRow());
    const spec = getNodeKindSpec("task")!;
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    await (
      spec.commands as {
        add: (
          ctx: { queryClient: unknown; isGuestMode: boolean },
          input: {
            workspaceId: string;
            taskId: string;
            position: { x: number; y: number };
          },
        ) => Promise<WorkspaceNode>;
      }
    ).add(
      { queryClient, isGuestMode: true },
      { workspaceId: "ws-1", taskId: TASK_ID, position: { x: 5, y: 6 } },
    );

    expect(addNode).toHaveBeenCalledWith({
      id: expect.any(String),
      workspaceId: "ws-1",
      kind: "task",
      entityType: "task",
      entityId: TASK_ID,
      positionX: 5,
      positionY: 6,
      width: 260,
      height: null,
      displayConfig: null,
    });
    expect(busEvents.events).toContainEqual({
      type: "node.added",
      workspaceId: "ws-1",
      nodeId: "node-1",
    });
    // Still just the one task — placing it copied nothing.
    expect(mockStore.getTasks().map((t) => t.id)).toEqual([TASK_ID]);
  });
});
