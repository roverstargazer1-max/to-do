"use client";

import type { ComponentType, CSSProperties } from "react";
import type { Node, NodeProps, NodeTypes } from "@xyflow/react";
import { z } from "zod";
import { nodeCommands } from "@/lib/commands/node";
import type { NodeCommandContext } from "@/lib/commands/node";
import { taskCommands } from "@/lib/commands/task";
import type {
  TaskCommandContext,
  ToggleTaskInput,
  ToggleTaskResult,
} from "@/lib/commands/task";
import type { NodePosition, WorkspaceNode } from "@/lib/types/workspace";
import { TaskNode } from "./TaskNode";
import { HabitNode } from "./HabitNode";
import { EventNode } from "./EventNode";
import { FocusNode } from "./FocusNode";
import { GroupNode } from "./GroupNode";
import { DocNode } from "./DocNode";
import { ProjectNode } from "./ProjectNode";
import { UnknownNode } from "./UnknownNode";

/**
 * The declarative node-kind registry (spec: Implementation Decisions → UI;
 * ADR 0018): each kind registers exactly once — kind, defaults, component,
 * commands, schema — and everything else derives from the single
 * registration: React Flow render routing (`workspaceNodeTypes`), row →
 * flow-node translation (`toWorkspaceFlowNodes`), read-boundary validation
 * (`resolveNodeKind`), and the kind's command surface (what the "add node"
 * flow and the node's own affordances execute).
 *
 * Unknown kinds never throw: they render the placeholder, so a canvas
 * last opened by a newer app version still renders after a downgrade.
 * A known kind whose row fails its schema degrades the same way.
 */

/** Flow-node data: the persisted node row — reference metadata only. */
export interface WorkspaceNodeData extends Record<string, unknown> {
  row: WorkspaceNode;
}

export type WorkspaceFlowNode = Node<WorkspaceNodeData>;

/** Props every node-kind component receives (narrowed from NodeProps). */
export interface WorkspaceNodeComponentProps {
  id: string;
  data: WorkspaceNodeData;
  /** The kind spec this node rendered through — registry-injected. */
  spec: NodeKindSpec;
}

export interface NodeKindDefaults {
  width: number | null;
  height: number | null;
}

/**
 * The task kind's command surface: the `node.add` binding (reference pair
 * + registry defaults) and the Domain Command a node checkbox invokes —
 * the same `taskCommands.toggle` the tasks-page hook executes.
 */
export type TaskNodeCommands = {
  add: (
    ctx: NodeCommandContext,
    input: { workspaceId: string; taskId: string; position: NodePosition },
  ) => Promise<WorkspaceNode>;
  toggle: (
    ctx: TaskCommandContext,
    input: ToggleTaskInput,
  ) => Promise<ToggleTaskResult>;
};

export interface NodeKindSpec {
  readonly kind: string;
  readonly label: string;
  readonly defaults: NodeKindDefaults;
  readonly component: ComponentType<WorkspaceNodeComponentProps>;
  /**
   * Per-kind command surface; the shape is kind-specific (nodes cast to
   * their kind's surface type), so the registry stays one homogeneous map.
   */
  readonly commands: Record<string, unknown>;
  /** Validates a node row of this kind at the read boundary. */
  readonly schema: z.ZodType;
}

/** The task row's soft-reference contract: kind, pair, and a real target. */
const TaskNodeRowSchema = z.object({
  kind: z.literal("task"),
  entity_type: z.literal("task"),
  entity_id: z.string().min(1),
});

const taskNodeSpec: NodeKindSpec = {
  kind: "task",
  label: "Task",
  defaults: { width: 260, height: null },
  component: TaskNode,
  commands: {
    // `node.add` for the task kind: the reference pair, the registry
    // defaults, and the placement — everything else is generic.
    add: (ctx: NodeCommandContext, input) =>
      nodeCommands.add(ctx, {
        workspaceId: input.workspaceId,
        kind: "task",
        entityType: "task",
        entityId: input.taskId,
        position: input.position,
        width: taskNodeSpec.defaults.width,
        height: taskNodeSpec.defaults.height,
      }),
    // The node's checkbox routes through the single registration to the
    // same Domain Command the tasks page uses.
    toggle: taskCommands.toggle,
  } satisfies TaskNodeCommands,
  schema: TaskNodeRowSchema,
};

/** The habit row's soft-reference contract: kind, pair, and a real target. */
const HabitNodeRowSchema = z.object({
  kind: z.literal("habit"),
  entity_type: z.literal("habit"),
  entity_id: z.string().min(1),
});

/**
 * The habit kind's command surface: only the `node.add` binding. Check-in
 * is the documented phase-1 asymmetry (ADR 0016): the HabitNode component
 * calls the existing `useMarkHabitComplete` mutation hook directly — the
 * same write path the habits page uses, not yet a command. There is still
 * only one write path; habit commands arrive in a later tranche.
 */
export type HabitNodeCommands = {
  add: (
    ctx: NodeCommandContext,
    input: { workspaceId: string; habitId: string; position: NodePosition },
  ) => Promise<WorkspaceNode>;
};

const habitNodeSpec: NodeKindSpec = {
  kind: "habit",
  label: "Habit",
  defaults: { width: 240, height: null },
  component: HabitNode,
  commands: {
    // `node.add` for the habit kind: the reference pair and the registry
    // defaults — everything else is generic.
    add: (ctx: NodeCommandContext, input) =>
      nodeCommands.add(ctx, {
        workspaceId: input.workspaceId,
        kind: "habit",
        entityType: "habit",
        entityId: input.habitId,
        position: input.position,
        width: habitNodeSpec.defaults.width,
        height: habitNodeSpec.defaults.height,
      }),
  } satisfies HabitNodeCommands,
  schema: HabitNodeRowSchema,
};

/** The event row's soft-reference contract: kind, pair, and a real target. */
const EventNodeRowSchema = z.object({
  kind: z.literal("event"),
  entity_type: z.literal("event"),
  entity_id: z.string().min(1),
});

/**
 * The event kind's command surface: only the `node.add` binding. The node
 * is display-only — calendar-event commands are a later tranche, and on
 * Guest, where calendar writes are degraded by existing design, the node
 * follows that degradation rather than inventing new guest write
 * behavior.
 */
export type EventNodeCommands = {
  add: (
    ctx: NodeCommandContext,
    input: { workspaceId: string; eventId: string; position: NodePosition },
  ) => Promise<WorkspaceNode>;
};

const eventNodeSpec: NodeKindSpec = {
  kind: "event",
  label: "Event",
  defaults: { width: 240, height: null },
  component: EventNode,
  commands: {
    // `node.add` for the event kind: the reference pair and the registry
    // defaults — everything else is generic.
    add: (ctx: NodeCommandContext, input) =>
      nodeCommands.add(ctx, {
        workspaceId: input.workspaceId,
        kind: "event",
        entityType: "event",
        entityId: input.eventId,
        position: input.position,
        width: eventNodeSpec.defaults.width,
        height: eventNodeSpec.defaults.height,
      }),
  } satisfies EventNodeCommands,
  schema: EventNodeRowSchema,
};

/**
 * The focus row's contract: the kind and a *null* reference pair — a
 * focus node projects the timer singleton and references no entity
 * (ADR 0020; the D3 schema's nullable pair, both-null side).
 */
const FocusNodeRowSchema = z.object({
  kind: z.literal("focus"),
  entity_type: z.null(),
  entity_id: z.null(),
});

/**
 * The focus kind's command surface: only the `node.add` binding. The node
 * is a projection of the timer singleton — timer start/pause/stop go
 * through the shared `TimerProvider` actions (the documented command-layer
 * exception, ADR 0016/0020), so there are no timer commands to route and
 * no timer Domain Events to publish.
 */
export type FocusNodeCommands = {
  add: (
    ctx: NodeCommandContext,
    input: { workspaceId: string; position: NodePosition },
  ) => Promise<WorkspaceNode>;
};

const focusNodeSpec: NodeKindSpec = {
  kind: "focus",
  label: "Focus",
  defaults: { width: 220, height: null },
  component: FocusNode,
  commands: {
    // `node.add` for the focus kind: no reference pair, just placement and
    // the registry defaults. The timer singleton is never touched.
    add: (ctx: NodeCommandContext, input) =>
      nodeCommands.add(ctx, {
        workspaceId: input.workspaceId,
        kind: "focus",
        entityType: null,
        entityId: null,
        position: input.position,
        width: focusNodeSpec.defaults.width,
        height: focusNodeSpec.defaults.height,
      }),
  } satisfies FocusNodeCommands,
  schema: FocusNodeRowSchema,
};

/**
 * The group container row's contract: kind and a *null* reference pair.
 */
const GroupNodeRowSchema = z.object({
  kind: z.literal("group"),
  entity_type: z.null(),
  entity_id: z.null(),
});

export type GroupNodeCommands = {
  createGroup: typeof nodeCommands.createGroup;
  ungroup: typeof nodeCommands.ungroup;
  renameGroup: typeof nodeCommands.renameGroup;
};

const groupNodeSpec: NodeKindSpec = {
  kind: "group",
  label: "Group",
  defaults: { width: 360, height: 240 },
  component: GroupNode,
  commands: {
    createGroup: nodeCommands.createGroup,
    ungroup: nodeCommands.ungroup,
    renameGroup: nodeCommands.renameGroup,
  } satisfies GroupNodeCommands,
  schema: GroupNodeRowSchema,
};

/**
 * The doc row's contract: kind and a *null* reference pair.
 */
const DocNodeRowSchema = z.object({
  kind: z.literal("doc"),
  entity_type: z.null(),
  entity_id: z.null(),
});

export type DocNodeCommands = {
  add: (
    ctx: NodeCommandContext,
    input: {
      workspaceId: string;
      position: NodePosition;
      title?: string;
      content?: string;
    },
  ) => Promise<WorkspaceNode>;
  update: typeof nodeCommands.updateDocNode;
};

const docNodeSpec: NodeKindSpec = {
  kind: "doc",
  label: "Doc",
  defaults: { width: 280, height: 180 },
  component: DocNode,
  commands: {
    add: (ctx: NodeCommandContext, input) =>
      nodeCommands.add(ctx, {
        workspaceId: input.workspaceId,
        kind: "doc",
        entityType: null,
        entityId: null,
        position: input.position,
        width: docNodeSpec.defaults.width,
        height: docNodeSpec.defaults.height,
        displayConfig: {
          title: input.title ?? "",
          content: input.content ?? "",
        },
      }),
    update: nodeCommands.updateDocNode,
  } satisfies DocNodeCommands,
  schema: DocNodeRowSchema,
};

/** The project row's soft-reference contract: kind, pair, and a real target. */
const ProjectNodeRowSchema = z.object({
  kind: z.literal("project"),
  entity_type: z.literal("project"),
  entity_id: z.string().min(1),
});

export type ProjectNodeCommands = {
  add: (
    ctx: NodeCommandContext,
    input: {
      workspaceId: string;
      projectId: string;
      position: NodePosition;
    },
  ) => Promise<WorkspaceNode>;
};

const projectNodeSpec: NodeKindSpec = {
  kind: "project",
  label: "Project",
  defaults: { width: 280, height: null },
  component: ProjectNode,
  commands: {
    add: (ctx: NodeCommandContext, input) =>
      nodeCommands.add(ctx, {
        workspaceId: input.workspaceId,
        kind: "project",
        entityType: "project",
        entityId: input.projectId,
        position: input.position,
        width: projectNodeSpec.defaults.width,
        height: projectNodeSpec.defaults.height,
      }),
  } satisfies ProjectNodeCommands,
  schema: ProjectNodeRowSchema,
};

/** The fallback kind — never registered, never throws. */
export const UNKNOWN_NODE_KIND = "unknown";

const unknownNodeSpec: NodeKindSpec = {
  kind: UNKNOWN_NODE_KIND,
  label: "Unknown",
  defaults: { width: 220, height: null },
  component: UnknownNode,
  commands: {},
  schema: z.unknown(),
};

const nodeKindRegistry = new Map<string, NodeKindSpec>();

/** Register a kind once; rendering and command routing derive from it. */
export function registerNodeKind(spec: NodeKindSpec): void {
  nodeKindRegistry.set(spec.kind, spec);
}

registerNodeKind(taskNodeSpec);
registerNodeKind(habitNodeSpec);
registerNodeKind(eventNodeSpec);
registerNodeKind(focusNodeSpec);
registerNodeKind(groupNodeSpec);
registerNodeKind(docNodeSpec);
registerNodeKind(projectNodeSpec);

/** Look up a registered kind spec (undefined for unknown kinds). */
export function getNodeKindSpec(kind: string): NodeKindSpec | undefined {
  return nodeKindRegistry.get(kind);
}

/**
 * Resolve a node row to its render spec: the registered kind if the row
 * passes the kind's schema; the placeholder otherwise (unknown kind, or a
 * known kind whose row violates its contract). Never throws.
 */
export function resolveNodeKind(row: WorkspaceNode): NodeKindSpec {
  const spec = nodeKindRegistry.get(row.kind);
  if (!spec) return unknownNodeSpec;
  return spec.schema.safeParse(row).success ? spec : unknownNodeSpec;
}

/**
 * Bind a spec's component for React Flow: the registry injects itself into
 * the node (the spec rides the props), so components never import the
 * registry at runtime — one registration, no cycles.
 */
function bindSpecComponent(spec: NodeKindSpec): ComponentType<NodeProps> {
  function SpecBoundNode(props: NodeProps) {
    return (
      <spec.component
        id={props.id}
        data={props.data as WorkspaceNodeData}
        spec={spec}
      />
    );
  }
  SpecBoundNode.displayName = `${spec.kind}Node`;
  return SpecBoundNode;
}

/**
 * React Flow render routing — derived from the registrations: a kind that
 * registers is routable, so adding a kind never touches this table. The
 * placeholder kind is always present and never registered.
 */
export const workspaceNodeTypes: NodeTypes = {
  ...Object.fromEntries(
    [...nodeKindRegistry.values()].map((spec) => [
      spec.kind,
      bindSpecComponent(spec),
    ]),
  ),
  [UNKNOWN_NODE_KIND]: bindSpecComponent(unknownNodeSpec),
};

/**
 * Translate persisted node rows into flow nodes via the registry. Nodes
 * are `deletable: false`: the canvas's Delete key cuts connections, and
 * a node is dismissed through its own control (ADR 0021).
 *
 * Group containers render before member nodes so the container sits behind
 * its children in DOM stacking order. Member nodes receive parentId so they move with
 * the group, but do not set expandParent so dragged cards can float outside without stretching
 * the container boundary.
 */
export function toWorkspaceFlowNodes(
  rows: WorkspaceNode[],
): WorkspaceFlowNode[] {
  const groupRows = rows.filter((r) => r.kind === "group");
  const memberRows = rows.filter((r) => r.kind !== "group");
  const sortedRows = [...groupRows, ...memberRows];

  const groupIds = new Set(groupRows.map((g) => g.id));

  return sortedRows.map((row) => {
    const spec = resolveNodeKind(row);
    const node: WorkspaceFlowNode = {
      id: row.id,
      type: spec.kind,
      position: { x: row.position_x, y: row.position_y },
      data: { row },
      // The Delete key belongs to connections (ADR 0021). A node leaves the
      // canvas through its own remove control — `node.remove`, a layout
      // write with its own event and toast — never by a keystroke that
      // would only edit local state.
      deletable: false,
    };

    if (row.group_id && groupIds.has(row.group_id)) {
      node.parentId = row.group_id;
    }

    const style: CSSProperties = {};
    if (row.width != null) style.width = row.width;
    if (row.height != null) style.height = row.height;
    if (row.width != null || row.height != null) node.style = style;

    return node;
  });
}
