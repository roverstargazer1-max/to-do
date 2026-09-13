/**
 * Domain Event vocabulary (ADR 0017).
 *
 * Events are past-tense named facts about one entity, published by Domain
 * Commands after a write lands. The payload is an entity reference plus at
 * most a minimal change summary — never a full row. Event names are the
 * trigger contract future consumers (Edge Engine, agents) will bind to, so
 * each outcome gets its own name: `task.completed` and `task.uncompleted`,
 * never `task.toggle` plus a flag.
 */

/** Reference shape every Task event carries — the entity's id, nothing more. */
interface TaskEventEntityRef {
  readonly taskId: string;
}

export interface TaskCreatedEvent extends TaskEventEntityRef {
  readonly type: "task.created";
  /** Minimal structural summary: which task (if any) the new row is a step of. */
  readonly parentId: string | null;
}

export interface TaskCompletedEvent extends TaskEventEntityRef {
  readonly type: "task.completed";
}

export interface TaskUncompletedEvent extends TaskEventEntityRef {
  readonly type: "task.uncompleted";
}

export interface TaskUpdatedEvent extends TaskEventEntityRef {
  readonly type: "task.updated";
}

export interface TaskDeletedEvent extends TaskEventEntityRef {
  readonly type: "task.deleted";
}

export type TaskDomainEvent =
  | TaskCreatedEvent
  | TaskCompletedEvent
  | TaskUncompletedEvent
  | TaskUpdatedEvent
  | TaskDeletedEvent;

/**
 * Workspace events — facts about the canvas arrangement, not domain
 * data. Same bus, same past-tense naming discipline: a workspace command
 * publishes one after the arrangement change lands. The payload is an
 * entity reference, never a full row. Node-level events (`node.added`,
 * `node.moved`, `node.removed`) form their own family below.
 */
interface WorkspaceEventEntityRef {
  readonly workspaceId: string;
}

export interface WorkspaceCreatedEvent extends WorkspaceEventEntityRef {
  readonly type: "workspace.created";
}

export interface WorkspaceRenamedEvent extends WorkspaceEventEntityRef {
  readonly type: "workspace.renamed";
}

export interface WorkspaceDeletedEvent extends WorkspaceEventEntityRef {
  readonly type: "workspace.deleted";
}

export type WorkspaceDomainEvent =
  WorkspaceCreatedEvent | WorkspaceRenamedEvent | WorkspaceDeletedEvent;

/**
 * Node events — facts about the canvas arrangement, published by node
 * commands (`node.add` / `node.move` / `node.remove`) after the layout
 * write lands. Same bus and past-tense naming discipline as Domain Events,
 * but the subject is the arrangement, not domain data: moving a node
 * publishes `node.moved`; toggling the task it references publishes
 * `task.completed` — different facts, different families. The payload is
 * the node reference (workspace + node ids), never a full row.
 */
interface NodeEventEntityRef {
  readonly workspaceId: string;
  readonly nodeId: string;
}

export interface NodeAddedEvent extends NodeEventEntityRef {
  readonly type: "node.added";
}

export interface NodeMovedEvent extends NodeEventEntityRef {
  readonly type: "node.moved";
}

export interface NodeRemovedEvent extends NodeEventEntityRef {
  readonly type: "node.removed";
}

export interface NodeResizedEvent extends NodeEventEntityRef {
  readonly type: "node.resized";
}

export interface NodeGroupedEvent extends NodeEventEntityRef {
  readonly type: "node.grouped";
  readonly groupId: string;
}

export interface NodeUngroupedEvent extends NodeEventEntityRef {
  readonly type: "node.ungrouped";
  readonly groupId: string;
}

export type NodeDomainEvent =
  | NodeAddedEvent
  | NodeMovedEvent
  | NodeRemovedEvent
  | NodeResizedEvent
  | NodeGroupedEvent
  | NodeUngroupedEvent;

/**
 * Edge events — facts about the arrangement's connections (ADR 0021).
 * Drawing a connection is `edge.added`, cutting one is `edge.removed`;
 * both carry the edge id (the node ids are already facts of their own
 * family). Edges are a visual layer with no runtime, so these are the
 * only two facts they can produce.
 */
interface EdgeEventEntityRef extends WorkspaceEventEntityRef {
  readonly edgeId: string;
}

export interface EdgeAddedEvent extends EdgeEventEntityRef {
  readonly type: "edge.added";
}

export interface EdgeUpdatedEvent extends EdgeEventEntityRef {
  readonly type: "edge.updated";
}

export interface EdgeRemovedEvent extends EdgeEventEntityRef {
  readonly type: "edge.removed";
}

export type EdgeDomainEvent =
  EdgeAddedEvent | EdgeUpdatedEvent | EdgeRemovedEvent;

/**
 * The full bus vocabulary. Task events from the first command tranche;
 * workspace, node and edge events from the workspace command tranches;
 * later tranches (habit, project, calendar-event) widen this union
 * further.
 */
export type DomainEvent =
  TaskDomainEvent | WorkspaceDomainEvent | NodeDomainEvent | EdgeDomainEvent;
