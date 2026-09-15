import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { setClient } from "../src/lib/supabase/client";
import {
  BlueprintPatchSchema,
  WorkspaceBlueprintSchema,
  type BlueprintPatch,
  type WorkspaceBlueprint,
} from "../src/lib/workspace/blueprint/types";
import { compileMermaidToBlueprint } from "../src/lib/workspace/blueprint/mermaid/index";
import {
  buildWorkspaceFromBlueprint,
  type BuildWorkspaceResult,
} from "../src/lib/workspace/blueprint/executor";
import {
  applyWorkspacePatch,
  type PatchResult,
} from "../src/lib/workspace/blueprint/patcher";
import {
  decompileWorkspaceToSnapshot,
  formatSnapshotToMarkdown,
} from "../src/lib/workspace/blueprint/decompiler";
import type {
  Workspace,
  WorkspaceEdge,
  WorkspaceNode,
} from "../src/lib/types/workspace";
import type { Habit } from "../src/lib/types/habit";
import type { Project, Task } from "../src/lib/types/task";
import {
  SUPPORTED_WORKSPACE_NODE_KINDS,
  WorkspaceMcpError,
  WORKSPACE_MCP_CONTRACT_VERSION,
  canonicalizeForReplay,
  emptyOperationCounts,
  isSupportedWorkspaceNodeKind,
  toErrorPayload,
  type WorkspaceOperationName,
  type WorkspaceOperationReceipt,
  type WorkspaceMcpErrorPayload,
} from "../src/lib/workspace/ai-contract";
import {
  McpMockBackend,
  isOwnedByMockAccount,
  type MockBackendState,
} from "./mock-backend";
import { GENERIC_WORKSPACE_WORKFLOW_REFERENCE } from "./workflow-reference";

const CONTEXT_LIMIT_MAX = 100;
const WORKSPACE_ROWS_MAX = 1000;
type EntityKind = "project" | "habit" | "task";
type EntityRecord = { id: string; user_id?: string | null };

interface WorkspaceState {
  workspace: Workspace;
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
  tasks: Task[];
  projects: Project[];
  habits: Habit[];
}

interface BuildInput {
  blueprint: WorkspaceBlueprint;
  inputForm: "canonical" | "mermaid" | "legacy";
  warnings: string[];
  requestId?: string;
}

interface PatchInput {
  patch: BlueprintPatch;
  inputForm: "canonical" | "legacy";
  warnings: string[];
  requestId?: string;
}

interface OperationOutcome {
  receipt: WorkspaceOperationReceipt;
  /** Compatibility-only rows for clients that predate operation receipts. */
  legacyResult?: Record<string, unknown>;
}

interface CachedOperation {
  fingerprint: string;
  outcome?: OperationOutcome;
  error?: WorkspaceMcpErrorPayload["error"];
}

interface InFlightRequest {
  fingerprint: string;
  promise: Promise<OperationOutcome>;
}

export interface McpServerOptions {
  supabaseUrl?: string;
  supabaseKey?: string;
  /** Explicit Account identity for a real MCP process. */
  identity?: string;
  /** Alias for embedding/test callers that use user terminology. */
  userId?: string;
  supabaseClient?: SupabaseClient;
  useMockFallback?: boolean;
  initialWorkspaces?: Workspace[];
  initialNodes?: WorkspaceNode[];
  initialEdges?: WorkspaceEdge[];
  initialTasks?: Task[];
  initialProjects?: Project[];
  initialHabits?: Habit[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function firstConfiguredIdentity(
  options: McpServerOptions,
): string | undefined {
  const identity =
    options.identity ??
    options.userId ??
    process.env.KAGELIN_MCP_USER_ID ??
    process.env.NEXT_PUBLIC_LOCAL_USER_ID;
  return identity?.trim() || undefined;
}

function inferMockIdentity(options: McpServerOptions): string {
  const records: Array<{ user_id?: string | null }> = [
    ...(options.initialWorkspaces ?? []),
    ...(options.initialNodes ?? []),
    ...(options.initialTasks ?? []),
    ...(options.initialProjects ?? []),
    ...(options.initialHabits ?? []),
  ];
  return records.find((record) => record.user_id)?.user_id ?? "mock-user";
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function matchesQuery(
  value: string | null | undefined,
  query: string,
): boolean {
  return (value ?? "").toLocaleLowerCase().includes(query);
}

function operationResult(payload: Record<string, unknown>, isError = false) {
  const result = {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload,
  };
  return isError ? { ...result, isError: true as const } : result;
}

function errorResult(err: unknown) {
  return operationResult(
    toErrorPayload(err) as unknown as Record<string, unknown>,
    true,
  );
}

function supabaseError(
  message: string,
  error: { message?: string } | null | undefined,
): WorkspaceMcpError {
  return new WorkspaceMcpError(
    "execution",
    message,
    error?.message ? { providerMessage: error.message } : {},
  );
}

function assertOwnedRecord(
  record: EntityRecord | undefined,
  label: string,
  id: string,
  userId: string,
  options: { allowMissingUserId?: boolean } = {},
): void {
  if (!record) {
    throw new WorkspaceMcpError(
      "invalid_reference",
      `${label} "${id}" was not found in the active Account.`,
      { entityType: label.toLocaleLowerCase(), entityId: id },
    );
  }
  if (
    record.user_id !== userId &&
    !(options.allowMissingUserId && !record.user_id)
  ) {
    throw new WorkspaceMcpError(
      "authorization",
      `${label} "${id}" belongs to another Account.`,
      { entityType: label.toLocaleLowerCase(), entityId: id },
    );
  }
}

function assertSupportedBlueprint(blueprint: WorkspaceBlueprint): void {
  const sectionIds = new Set<string>();
  const itemIds = new Set<string>();
  for (const section of blueprint.sections) {
    if (sectionIds.has(section.id)) {
      throw new WorkspaceMcpError(
        "invalid_input",
        `Blueprint section ID "${section.id}" is duplicated.`,
        { sectionId: section.id },
      );
    }
    sectionIds.add(section.id);
    for (const item of section.items) {
      if (itemIds.has(item.id)) {
        throw new WorkspaceMcpError(
          "invalid_input",
          `Blueprint item ID "${item.id}" is duplicated.`,
          { itemId: item.id },
        );
      }
      itemIds.add(item.id);
      if (!isSupportedWorkspaceNodeKind(item.kind)) {
        throw new WorkspaceMcpError(
          "unsupported_operation",
          `Node kind "${item.kind}" is not supported by the v1 Workspace MCP contract.`,
          {
            kind: item.kind,
            supportedKinds: [...SUPPORTED_WORKSPACE_NODE_KINDS],
          },
        );
      }
    }
  }

  const pairs = new Set<string>();
  for (const flow of blueprint.flows ?? []) {
    if (!itemIds.has(flow.fromItemId) || !itemIds.has(flow.toItemId)) {
      throw new WorkspaceMcpError(
        "invalid_reference",
        "A Blueprint connection references an unknown item.",
        { fromItemId: flow.fromItemId, toItemId: flow.toItemId },
      );
    }
    if (flow.fromItemId === flow.toItemId) {
      throw new WorkspaceMcpError(
        "invalid_input",
        "Self-connections are not allowed.",
        { itemId: flow.fromItemId },
      );
    }
    const pair = `${flow.fromItemId}\u0000${flow.toItemId}`;
    if (pairs.has(pair)) {
      throw new WorkspaceMcpError(
        "invalid_input",
        "Duplicate Blueprint connections are not allowed.",
        { fromItemId: flow.fromItemId, toItemId: flow.toItemId },
      );
    }
    pairs.add(pair);
  }
}

function patchChangeCount(patch: BlueprintPatch): number {
  return (
    (patch.addItems?.length ?? 0) +
    (patch.updateDocs?.length ?? 0) +
    (patch.updateDecisions?.length ?? 0) +
    (patch.updateSteps?.length ?? 0) +
    (patch.removeNodeIds?.length ?? 0) +
    (patch.addFlows?.length ?? 0) +
    (patch.removeEdgeIds?.length ?? 0)
  );
}

function patchNeedsConfirmation(patch: BlueprintPatch): boolean {
  return (
    (patch.removeNodeIds?.length ?? 0) > 0 ||
    (patch.removeEdgeIds?.length ?? 0) > 0 ||
    patchChangeCount(patch) > 10 ||
    (patch.addFlows?.length ?? 0) > 5 ||
    (patch.removeNodeIds?.length ?? 0) > 1 ||
    (patch.removeEdgeIds?.length ?? 0) > 1
  );
}

function assertUniquePatchTargets(
  ids: string[] | undefined,
  label: string,
): void {
  if (!ids) return;
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new WorkspaceMcpError(
        "invalid_input",
        `Patch ${label} contains duplicate ID "${id}".`,
        { id, label },
      );
    }
    seen.add(id);
  }
}

function buildReceipt(
  result: BuildWorkspaceResult,
  input: BuildInput,
): WorkspaceOperationReceipt {
  return {
    success: true,
    contractVersion: WORKSPACE_MCP_CONTRACT_VERSION,
    operation: "build_workspace",
    workspaceId: result.workspaceId,
    requestId: input.requestId,
    status: "succeeded",
    replayed: false,
    inputForm: input.inputForm,
    itemNodeIds: result.itemNodeIds,
    linkedEntityIds: result.linkedEntityIds,
    createdEntityIds: result.createdEntityIds,
    addedNodeIds: result.nodes.map((node) => node.id),
    updatedNodeIds: [],
    removedNodeIds: [],
    addedConnectionIds: result.edges.map((edge) => edge.id),
    removedConnectionIds: [],
    counts: {
      ...emptyOperationCounts(),
      nodes: result.nodeCount,
      edges: result.edgeCount,
      addedNodes: result.nodeCount,
      addedConnections: result.edgeCount,
    },
    warnings: [...input.warnings],
  };
}

function patchReceipt(
  result: PatchResult,
  input: PatchInput,
): WorkspaceOperationReceipt {
  const updatedNodeIds = unique([
    ...result.updatedDocNodeIds,
    ...(result.updatedDecisionNodeIds ?? []),
    ...(result.updatedStepNodeIds ?? []),
  ]);
  return {
    success: true,
    contractVersion: WORKSPACE_MCP_CONTRACT_VERSION,
    operation: "patch_workspace",
    workspaceId: result.workspaceId,
    requestId: input.requestId,
    status: "succeeded",
    replayed: false,
    inputForm: input.inputForm,
    itemNodeIds: result.itemNodeIds,
    linkedEntityIds: result.linkedEntityIds,
    createdEntityIds: result.createdEntityIds,
    addedNodeIds: result.addedNodes.map((node) => node.id),
    updatedNodeIds,
    removedNodeIds: result.removedNodeIds,
    addedConnectionIds: result.addedEdges.map((edge) => edge.id),
    removedConnectionIds: result.removedEdgeIds,
    counts: {
      ...emptyOperationCounts(),
      addedNodes: result.addedNodes.length,
      updatedNodes: updatedNodeIds.length,
      removedNodes: result.removedNodeIds.length,
      addedConnections: result.addedEdges.length,
      removedConnections: result.removedEdgeIds.length,
    },
    warnings: [...input.warnings],
  };
}

async function replaySafe(
  cache: Map<string, CachedOperation>,
  inFlight: Map<string, InFlightRequest>,
  operation: WorkspaceOperationName,
  requestId: string | undefined,
  canonicalInput: unknown,
  execute: () => Promise<OperationOutcome>,
): Promise<OperationOutcome> {
  if (!requestId) return execute();
  const fingerprint = canonicalizeForReplay({ operation, canonicalInput });
  const cached = cache.get(requestId);
  if (cached) {
    if (cached.fingerprint !== fingerprint) {
      throw new WorkspaceMcpError(
        "request_conflict",
        `Request ID "${requestId}" was already used with different input.`,
        { requestId, operation },
      );
    }
    if (cached.error) {
      throw new WorkspaceMcpError(
        cached.error.category,
        cached.error.message,
        cached.error.details,
      );
    }
    if (!cached.outcome) {
      throw new WorkspaceMcpError(
        "execution",
        `Request ID "${requestId}" has no replayable result.`,
        { requestId, operation },
      );
    }
    return {
      ...clone(cached.outcome),
      receipt: {
        ...clone(cached.outcome.receipt),
        status: "replayed",
        replayed: true,
      },
    };
  }
  const running = inFlight.get(requestId);
  if (running) {
    if (running.fingerprint !== fingerprint) {
      throw new WorkspaceMcpError(
        "request_conflict",
        `Request ID "${requestId}" is already running with different input.`,
        { requestId, operation },
      );
    }
    const outcome = await running.promise;
    return {
      ...clone(outcome),
      receipt: {
        ...clone(outcome.receipt),
        status: "replayed",
        replayed: true,
      },
    };
  }
  const promise = execute();
  inFlight.set(requestId, { fingerprint, promise });
  try {
    const outcome = await promise;
    cache.set(requestId, { fingerprint, outcome: clone(outcome) });
    return outcome;
  } catch (error) {
    const errorPayload = toErrorPayload(error);
    cache.set(requestId, {
      fingerprint,
      error: clone(errorPayload.error),
    });
    throw error;
  } finally {
    inFlight.delete(requestId);
  }
}

export function createKagelinMcpServer(
  options: McpServerOptions = {},
): McpServer {
  const server = new McpServer({
    name: "kagelin-workspace-ai-builder",
    version: "1.1.0",
  });
  const supabaseUrl =
    options.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    options.supabaseKey ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const useMockFallback =
    options.useMockFallback ??
    (process.env.KAGELIN_MOCK_MODE === "true" ||
      (!supabaseUrl && !options.supabaseClient));
  let nodeSupabaseClient: SupabaseClient | null =
    options.supabaseClient ?? null;
  if (!useMockFallback && !nodeSupabaseClient && supabaseUrl && supabaseKey) {
    nodeSupabaseClient = createSupabaseClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    setClient(nodeSupabaseClient);
  } else if (nodeSupabaseClient) {
    setClient(nodeSupabaseClient);
  }

  const configuredIdentity = firstConfiguredIdentity(options);
  const activeUserId = useMockFallback
    ? (configuredIdentity ?? inferMockIdentity(options))
    : (configuredIdentity ?? "");
  const mockBackend = useMockFallback
    ? new McpMockBackend({
        userId: activeUserId,
        workspaces: options.initialWorkspaces,
        nodes: options.initialNodes,
        edges: options.initialEdges,
        tasks: options.initialTasks,
        projects: options.initialProjects,
        habits: options.initialHabits,
      })
    : null;
  // A request ID belongs to the whole MCP mutation surface, not to one tool.
  // Sharing both maps makes build↔patch reuse a conflict instead of allowing
  // two different operations to claim the same retry key.
  const replayCache = new Map<string, CachedOperation>();
  const inFlightRequests = new Map<string, InFlightRequest>();

  let authPromise: Promise<void> | null = null;
  async function ensureAuthenticated(): Promise<void> {
    if (useMockFallback) return;
    if (!configuredIdentity) {
      throw new WorkspaceMcpError(
        "authentication",
        "MCP Server requires an explicit Account identity; no data was changed.",
      );
    }
    if (!nodeSupabaseClient) {
      throw new WorkspaceMcpError(
        "authentication",
        "MCP Server could not establish its Supabase connection; no data was changed.",
      );
    }
    if (!authPromise) {
      authPromise = (async () => {
        const {
          data: { session },
          error,
        } = await nodeSupabaseClient!.auth.getSession();
        if (error) {
          throw new WorkspaceMcpError(
            "authentication",
            "MCP Server could not verify the configured Account identity.",
            { providerMessage: error.message },
          );
        }
        if (session?.user && session.user.id !== configuredIdentity) {
          throw new WorkspaceMcpError(
            "authorization",
            "The active Supabase session does not match the configured Account identity.",
            { identity: configuredIdentity },
          );
        }
        const privilegedKey =
          Boolean(process.env.SUPABASE_SECRET_KEY) ||
          options.supabaseKey?.startsWith("sb_secret_") ||
          options.supabaseKey?.includes("service_role");
        if (!session?.user && !privilegedKey) {
          throw new WorkspaceMcpError(
            "authentication",
            "MCP Server requires an authenticated session for the configured Account identity.",
          );
        }
        process.env.KAGELIN_MCP_USER_ID = configuredIdentity;
      })();
    }
    await authPromise;
  }

  function currentMockState(): MockBackendState {
    if (!mockBackend)
      throw new Error("Mock backend is unavailable in real mode");
    return mockBackend.getState();
  }

  async function fetchEntityRecord(
    kind: EntityKind,
    id: string,
    fullRow = false,
  ): Promise<EntityRecord | undefined> {
    if (mockBackend) {
      const state = currentMockState();
      const collection =
        kind === "task"
          ? state.tasks
          : kind === "project"
            ? state.projects
            : state.habits;
      return collection.find((record) => record.id === id) as
        (EntityRecord & Record<string, unknown>) | undefined;
    }
    if (!nodeSupabaseClient) return undefined;
    const table =
      kind === "task" ? "tasks" : kind === "project" ? "projects" : "habits";
    const { data, error } = await nodeSupabaseClient
      .from(table)
      .select(fullRow ? "*" : "id, user_id")
      .eq("id", id)
      .maybeSingle();
    if (error)
      throw supabaseError(
        `Could not inspect ${kind} reference "${id}".`,
        error,
      );
    return (data as EntityRecord | null) ?? undefined;
  }

  async function assertEntityReference(
    kind: EntityKind,
    id: string,
  ): Promise<void> {
    assertOwnedRecord(
      await fetchEntityRecord(kind, id),
      kind,
      id,
      activeUserId,
      {
        allowMissingUserId: Boolean(mockBackend),
      },
    );
  }

  async function readWorkspaceState(
    workspaceId: string,
  ): Promise<WorkspaceState> {
    if (mockBackend) {
      const state = currentMockState();
      const workspace = state.workspaces.find(
        (item) => item.id === workspaceId,
      );
      if (!workspace) {
        throw new WorkspaceMcpError(
          "invalid_reference",
          `Workspace "${workspaceId}" was not found.`,
          { workspaceId },
        );
      }
      if (!isOwnedByMockAccount(workspace, activeUserId)) {
        throw new WorkspaceMcpError(
          "authorization",
          `Workspace "${workspaceId}" belongs to another Account.`,
          { workspaceId },
        );
      }
      const nodes = state.nodes.filter(
        (node) => node.workspace_id === workspaceId,
      );
      const edges = state.edges.filter(
        (edge) => edge.workspace_id === workspaceId,
      );
      for (const node of nodes) {
        if (!isOwnedByMockAccount(node, activeUserId)) {
          throw new WorkspaceMcpError(
            "authorization",
            `Node "${node.id}" is not owned by the active Account.`,
            { nodeId: node.id, workspaceId },
          );
        }
      }
      for (const edge of edges) {
        if (!isOwnedByMockAccount(edge, activeUserId)) {
          throw new WorkspaceMcpError(
            "authorization",
            `Connection "${edge.id}" is not owned by the active Account.`,
            { edgeId: edge.id, workspaceId },
          );
        }
      }
      return {
        workspace: clone(workspace),
        nodes,
        edges,
        tasks: state.tasks,
        projects: state.projects,
        habits: state.habits,
      };
    }
    if (!nodeSupabaseClient)
      throw new WorkspaceMcpError(
        "authentication",
        "MCP Server is not connected.",
      );
    const { data: workspace, error: workspaceError } = await nodeSupabaseClient
      .from("workspaces")
      .select("id, user_id, name, color, created_at, updated_at")
      .eq("id", workspaceId)
      .maybeSingle();
    if (workspaceError)
      throw supabaseError(
        "Could not inspect the target Workspace.",
        workspaceError,
      );
    if (!workspace)
      throw new WorkspaceMcpError(
        "invalid_reference",
        `Workspace "${workspaceId}" was not found.`,
        { workspaceId },
      );
    if (workspace.user_id !== activeUserId)
      throw new WorkspaceMcpError(
        "authorization",
        `Workspace "${workspaceId}" belongs to another Account.`,
        { workspaceId },
      );
    const { data: nodes, error: nodesError } = await nodeSupabaseClient
      .from("workspace_nodes")
      .select(
        "id, workspace_id, user_id, kind, entity_type, entity_id, position_x, position_y, width, height, group_id, display_config, created_at, updated_at",
      )
      .eq("workspace_id", workspaceId)
      .limit(WORKSPACE_ROWS_MAX);
    if (nodesError)
      throw supabaseError("Could not inspect Workspace nodes.", nodesError);
    const { data: edges, error: edgesError } = await nodeSupabaseClient
      .from("workspace_edges")
      .select(
        "id, workspace_id, user_id, source_node_id, target_node_id, label, source_handle, target_handle, created_at, updated_at",
      )
      .eq("workspace_id", workspaceId)
      .limit(WORKSPACE_ROWS_MAX);
    if (edgesError)
      throw supabaseError(
        "Could not inspect Workspace connections.",
        edgesError,
      );
    for (const node of nodes ?? []) {
      if (node.user_id !== activeUserId) {
        throw new WorkspaceMcpError(
          "authorization",
          `Node "${node.id}" is not owned by the active Account.`,
          { nodeId: node.id, workspaceId },
        );
      }
    }
    for (const edge of edges ?? []) {
      if (edge.user_id !== activeUserId) {
        throw new WorkspaceMcpError(
          "authorization",
          `Connection "${edge.id}" is not owned by the active Account.`,
          { edgeId: edge.id, workspaceId },
        );
      }
    }
    return {
      workspace: workspace as Workspace,
      nodes: (nodes ?? []) as WorkspaceNode[],
      edges: (edges ?? []) as WorkspaceEdge[],
      tasks: [],
      projects: [],
      habits: [],
    };
  }

  async function resolveOwnedEntity<T extends EntityRecord>(
    kind: EntityKind,
    id: string,
    records: T[],
  ): Promise<T | null> {
    const localRecord = records.find((record) => record.id === id);
    const record = localRecord ?? (await fetchEntityRecord(kind, id, true));
    if (!record) return null;
    assertOwnedRecord(record, kind, id, activeUserId, {
      allowMissingUserId: Boolean(mockBackend),
    });
    return record as T;
  }

  async function validateBuild(blueprint: WorkspaceBlueprint): Promise<void> {
    assertSupportedBlueprint(blueprint);
    for (const section of blueprint.sections) {
      for (const item of section.items) {
        if (item.kind === "task" && item.existingTaskId)
          await assertEntityReference("task", item.existingTaskId);
        if (item.kind === "habit" && item.existingHabitId)
          await assertEntityReference("habit", item.existingHabitId);
        if (item.kind === "project" && item.existingProjectId)
          await assertEntityReference("project", item.existingProjectId);
      }
    }
  }

  async function validatePatch(patch: BlueprintPatch): Promise<WorkspaceState> {
    const state = await readWorkspaceState(patch.workspaceId);
    const nodesById = new Map(state.nodes.map((node) => [node.id, node]));
    const edgesById = new Map(state.edges.map((edge) => [edge.id, edge]));
    assertUniquePatchTargets(patch.removeNodeIds, "node removals");
    assertUniquePatchTargets(patch.removeEdgeIds, "Connection removals");
    assertUniquePatchTargets(
      patch.updateDocs?.map((update) => update.nodeId),
      "document updates",
    );
    assertUniquePatchTargets(
      patch.updateDecisions?.map((update) => update.nodeId),
      "decision updates",
    );
    assertUniquePatchTargets(
      patch.updateSteps?.map((update) => update.nodeId),
      "step updates",
    );
    for (const node of state.nodes) {
      if (node.user_id && node.user_id !== activeUserId)
        throw new WorkspaceMcpError(
          "authorization",
          `Node "${node.id}" is not owned by the active Account.`,
          { nodeId: node.id },
        );
    }
    for (const edge of state.edges) {
      if (edge.user_id && edge.user_id !== activeUserId)
        throw new WorkspaceMcpError(
          "authorization",
          `Connection "${edge.id}" is not owned by the active Account.`,
          { edgeId: edge.id },
        );
    }
    if (
      patchNeedsConfirmation(patch) &&
      patch.destructiveConfirmation !== true
    ) {
      throw new WorkspaceMcpError(
        "confirmation_required",
        "This patch removes canvas data or is a broad batch. Retry only after the user confirms the specific change with destructiveConfirmation: true.",
        {
          workspaceId: patch.workspaceId,
          removesNodeIds: patch.removeNodeIds ?? [],
          removesConnectionIds: patch.removeEdgeIds ?? [],
          changeCount: patchChangeCount(patch),
        },
      );
    }
    for (const id of unique(patch.removeNodeIds ?? [])) {
      if (!nodesById.has(id))
        throw new WorkspaceMcpError(
          "invalid_reference",
          `Node "${id}" is not in Workspace "${patch.workspaceId}".`,
          { nodeId: id, workspaceId: patch.workspaceId },
        );
    }
    for (const id of unique(patch.removeEdgeIds ?? [])) {
      if (!edgesById.has(id))
        throw new WorkspaceMcpError(
          "invalid_reference",
          `Connection "${id}" is not in Workspace "${patch.workspaceId}".`,
          { edgeId: id, workspaceId: patch.workspaceId },
        );
    }
    for (const update of patch.updateDocs ?? []) {
      if (nodesById.get(update.nodeId)?.kind !== "doc")
        throw new WorkspaceMcpError(
          "invalid_reference",
          `Document node "${update.nodeId}" is not a valid target.`,
          { nodeId: update.nodeId },
        );
    }
    for (const update of patch.updateDecisions ?? []) {
      if (nodesById.get(update.nodeId)?.kind !== "decision")
        throw new WorkspaceMcpError(
          "invalid_reference",
          `Decision node "${update.nodeId}" is not a valid target.`,
          { nodeId: update.nodeId },
        );
    }
    for (const update of patch.updateSteps ?? []) {
      if (nodesById.get(update.nodeId)?.kind !== "step")
        throw new WorkspaceMcpError(
          "invalid_reference",
          `Step node "${update.nodeId}" is not a valid target.`,
          { nodeId: update.nodeId },
        );
    }
    const removedNodeIds = new Set(patch.removeNodeIds ?? []);
    for (const update of [
      ...(patch.updateDocs ?? []),
      ...(patch.updateDecisions ?? []),
      ...(patch.updateSteps ?? []),
    ]) {
      if (removedNodeIds.has(update.nodeId)) {
        throw new WorkspaceMcpError(
          "invalid_input",
          `Node "${update.nodeId}" cannot be updated and removed in the same patch.`,
          { nodeId: update.nodeId, workspaceId: patch.workspaceId },
        );
      }
    }
    const newItemIds = new Set<string>();
    for (const add of patch.addItems ?? []) {
      if (newItemIds.has(add.item.id) || nodesById.has(add.item.id))
        throw new WorkspaceMcpError(
          "invalid_input",
          `Added item ID "${add.item.id}" conflicts with an existing item.`,
          { itemId: add.item.id },
        );
      newItemIds.add(add.item.id);
      if (!isSupportedWorkspaceNodeKind(add.item.kind))
        throw new WorkspaceMcpError(
          "unsupported_operation",
          `Node kind "${add.item.kind}" is not supported by the v1 Workspace MCP contract.`,
          {
            kind: add.item.kind,
            supportedKinds: [...SUPPORTED_WORKSPACE_NODE_KINDS],
          },
        );
      const groupId = add.targetGroupId ?? add.sectionId;
      if (groupId && nodesById.get(groupId)?.kind !== "group")
        throw new WorkspaceMcpError(
          "invalid_reference",
          `Target group "${groupId}" is not in the target Workspace.`,
          { targetGroupId: groupId },
        );
      if (add.item.kind === "task" && add.item.existingTaskId)
        await assertEntityReference("task", add.item.existingTaskId);
      if (add.item.kind === "habit" && add.item.existingHabitId)
        await assertEntityReference("habit", add.item.existingHabitId);
      if (add.item.kind === "project" && add.item.existingProjectId)
        await assertEntityReference("project", add.item.existingProjectId);
    }
    const pairs = new Set<string>();
    for (const flow of patch.addFlows ?? []) {
      if (flow.fromItemId === flow.toItemId)
        throw new WorkspaceMcpError(
          "invalid_input",
          "Self-connections are not allowed.",
          { itemId: flow.fromItemId },
        );
      if (
        !(nodesById.has(flow.fromItemId) || newItemIds.has(flow.fromItemId)) ||
        !(nodesById.has(flow.toItemId) || newItemIds.has(flow.toItemId))
      )
        throw new WorkspaceMcpError(
          "invalid_reference",
          "A patch connection references an unknown node or added item.",
          { fromItemId: flow.fromItemId, toItemId: flow.toItemId },
        );
      if (
        patch.removeNodeIds?.includes(flow.fromItemId) ||
        patch.removeNodeIds?.includes(flow.toItemId)
      )
        throw new WorkspaceMcpError(
          "invalid_input",
          "A connection cannot target a node removed in the same patch.",
          { fromItemId: flow.fromItemId, toItemId: flow.toItemId },
        );
      const pair = `${flow.fromItemId}\u0000${flow.toItemId}`;
      if (pairs.has(pair))
        throw new WorkspaceMcpError(
          "invalid_input",
          "Duplicate patch connections are not allowed.",
          { fromItemId: flow.fromItemId, toItemId: flow.toItemId },
        );
      pairs.add(pair);
      const existing = state.edges.find(
        (edge) =>
          edge.source_node_id === flow.fromItemId &&
          edge.target_node_id === flow.toItemId,
      );
      if (existing && !patch.removeEdgeIds?.includes(existing.id))
        throw new WorkspaceMcpError(
          "invalid_input",
          "The requested connection already exists.",
          { edgeId: existing.id },
        );
    }
    return state;
  }

  async function resolveProjectByName(
    name: string,
  ): Promise<string | undefined> {
    const normalizedName = name.trim().toLocaleLowerCase();
    if (mockBackend)
      return currentMockState().projects.find(
        (project) =>
          isOwnedByMockAccount(project, activeUserId) &&
          project.name.trim().toLocaleLowerCase() === normalizedName,
      )?.id;
    if (!nodeSupabaseClient) return undefined;
    const { data, error } = await nodeSupabaseClient
      .from("projects")
      .select("id, name")
      .eq("user_id", activeUserId)
      .ilike("name", name)
      .limit(1)
      .maybeSingle();
    if (error)
      throw supabaseError("Could not resolve a reusable Project.", error);
    return (data as { id?: string } | null)?.id;
  }

  async function resolveHabitByName(name: string): Promise<string | undefined> {
    const normalizedName = name.trim().toLocaleLowerCase();
    if (mockBackend)
      return currentMockState().habits.find(
        (habit) =>
          isOwnedByMockAccount(habit, activeUserId) &&
          habit.name.trim().toLocaleLowerCase() === normalizedName,
      )?.id;
    if (!nodeSupabaseClient) return undefined;
    const { data, error } = await nodeSupabaseClient
      .from("habits")
      .select("id, name")
      .eq("user_id", activeUserId)
      .ilike("name", name)
      .limit(1)
      .maybeSingle();
    if (error)
      throw supabaseError("Could not resolve a reusable Habit.", error);
    return (data as { id?: string } | null)?.id;
  }

  async function executeBuild(input: BuildInput): Promise<OperationOutcome> {
    await ensureAuthenticated();
    await validateBuild(input.blueprint);
    const result = await buildWorkspaceFromBlueprint(input.blueprint, {
      isGuestMode: Boolean(mockBackend),
      commandAdapters: mockBackend?.commandAdapters,
      onResolveProject: resolveProjectByName,
      onResolveHabit: resolveHabitByName,
    });
    return { receipt: buildReceipt(result, input) };
  }

  async function executePatch(input: PatchInput): Promise<OperationOutcome> {
    await ensureAuthenticated();
    const state = await validatePatch(input.patch);
    const result = await applyWorkspacePatch(input.patch, {
      isGuestMode: Boolean(mockBackend),
      nodes: state.nodes,
      edges: state.edges,
      commandAdapters: mockBackend?.commandAdapters,
      onResolveProject: resolveProjectByName,
      onResolveHabit: resolveHabitByName,
    });
    return {
      receipt: patchReceipt(result, input),
      legacyResult: result as unknown as Record<string, unknown>,
    };
  }

  function parseBuildInput(args: {
    blueprint?: WorkspaceBlueprint;
    mermaid?: string;
    name?: string;
    color?: string;
    sections?: unknown[];
    flows?: unknown[];
    requestId?: string;
    request_id?: string;
  }): BuildInput {
    const requestId = args.requestId ?? args.request_id;
    if (args.blueprint && args.mermaid)
      throw new WorkspaceMcpError(
        "invalid_input",
        "Choose either the canonical blueprint object or mermaid, not both.",
      );
    if (args.mermaid)
      return {
        blueprint: compileMermaidToBlueprint(args.mermaid, {
          name: args.name,
          color: args.color,
        }),
        inputForm: "mermaid",
        warnings: [],
        requestId,
      };
    if (args.blueprint)
      return {
        blueprint: WorkspaceBlueprintSchema.parse(args.blueprint),
        inputForm: "canonical",
        warnings: [],
        requestId,
      };
    return {
      blueprint: WorkspaceBlueprintSchema.parse({
        name: args.name,
        color: args.color,
        sections: args.sections,
        flows: args.flows,
      }),
      inputForm: "legacy",
      warnings: [
        "Legacy flat build arguments were accepted; prefer the blueprint object on future calls.",
      ],
      requestId,
    };
  }

  function parsePatchInput(args: {
    patch?: BlueprintPatch;
    workspaceId?: string;
    addItems?: unknown[];
    removeNodeIds?: string[];
    updateDocs?: unknown[];
    updateDecisions?: unknown[];
    updateSteps?: unknown[];
    addFlows?: unknown[];
    removeEdgeIds?: string[];
    destructiveConfirmation?: boolean;
    confirmed?: boolean;
    requestId?: string;
    request_id?: string;
  }): PatchInput {
    const marker = args.destructiveConfirmation ?? args.confirmed;
    const patch = args.patch
      ? BlueprintPatchSchema.parse({
          ...args.patch,
          ...(marker !== undefined &&
          args.patch.destructiveConfirmation === undefined
            ? { destructiveConfirmation: marker }
            : {}),
        })
      : BlueprintPatchSchema.parse({
          workspaceId: args.workspaceId,
          addItems: args.addItems,
          removeNodeIds: args.removeNodeIds,
          updateDocs: args.updateDocs,
          updateDecisions: args.updateDecisions,
          updateSteps: args.updateSteps,
          addFlows: args.addFlows,
          removeEdgeIds: args.removeEdgeIds,
          destructiveConfirmation: marker,
        });
    return {
      patch,
      inputForm: args.patch ? "canonical" : "legacy",
      warnings: args.patch
        ? []
        : [
            "Legacy flat patch arguments were accepted; prefer the patch object on future calls.",
          ],
      requestId: args.requestId ?? args.request_id,
    };
  }

  server.tool(
    "list_workspaces",
    "List the active Account's Workspaces with IDs, names, colors, and bounded node counts. Use this to resolve an existing target before patching; it is read-only and account-scoped.",
    {},
    async () => {
      try {
        await ensureAuthenticated();
        let workspaces: Workspace[];
        if (mockBackend)
          workspaces = currentMockState().workspaces.filter((workspace) =>
            isOwnedByMockAccount(workspace, activeUserId),
          );
        else if (nodeSupabaseClient) {
          const { data, error } = await nodeSupabaseClient
            .from("workspaces")
            .select("id, user_id, name, color, created_at, updated_at")
            .eq("user_id", activeUserId)
            .order("created_at", { ascending: true })
            .limit(WORKSPACE_ROWS_MAX);
          if (error) throw supabaseError("Could not list Workspaces.", error);
          workspaces = (data ?? []) as Workspace[];
        } else
          throw new WorkspaceMcpError(
            "authentication",
            "MCP Server is not connected.",
          );
        const state = mockBackend ? currentMockState() : null;
        const summaries = workspaces.map((workspace) => ({
          id: workspace.id,
          name: workspace.name,
          color: workspace.color,
          nodeCount:
            state?.nodes.filter(
              (node) =>
                node.workspace_id === workspace.id &&
                isOwnedByMockAccount(node, activeUserId),
            ).length ?? 0,
        }));
        if (!mockBackend && nodeSupabaseClient) {
          for (const summary of summaries) {
            const { count, error } = await nodeSupabaseClient
              .from("workspace_nodes")
              .select("id", { count: "exact", head: true })
              .eq("workspace_id", summary.id)
              .eq("user_id", activeUserId);
            if (error)
              throw supabaseError("Could not count Workspace nodes.", error);
            summary.nodeCount = count ?? 0;
          }
        }
        return operationResult({
          contractVersion: WORKSPACE_MCP_CONTRACT_VERSION,
          workspaces: summaries,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "inspect_app_context",
    "Inspect bounded, Account-scoped Projects, Habits, and recent Tasks before creating a Workspace. Optional query, entityKind/entityKinds, and limit filters are applied without a separate search tool; this is read-only and supports live-reference reuse.",
    {
      query: z.string().optional().describe("Case-insensitive text filter."),
      entityKind: z
        .enum(["project", "habit", "task"])
        .optional()
        .describe("Return one domain entity kind."),
      entityKinds: z
        .array(z.enum(["project", "habit", "task"]))
        .max(3)
        .optional()
        .describe("Return one or more domain kinds."),
      kind: z
        .enum(["project", "habit", "task"])
        .optional()
        .describe("Legacy alias for entityKind."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(CONTEXT_LIMIT_MAX)
        .optional()
        .describe(
          `Maximum results per collection (default 20, max ${CONTEXT_LIMIT_MAX}).`,
        ),
    },
    async ({ query, entityKind, entityKinds, kind, limit = 20 }) => {
      try {
        await ensureAuthenticated();
        const selectedKinds = new Set<EntityKind>(
          entityKinds ?? ((entityKind ?? kind) ? [entityKind ?? kind!] : []),
        );
        const normalizedQuery = query?.trim().toLocaleLowerCase();
        let projects: Array<{ id: string; name: string; color: string }> = [];
        let habits: Array<{ id: string; name: string; color?: string }> = [];
        let tasks: Array<{
          id: string;
          content: string;
          priority?: number;
          due_date?: string | null;
          is_completed: boolean;
          project_id?: string | null;
        }> = [];
        if (mockBackend) {
          const state = currentMockState();
          if (selectedKinds.size === 0 || selectedKinds.has("project"))
            projects = state.projects
              .filter((project) => isOwnedByMockAccount(project, activeUserId))
              .filter(
                (project) =>
                  !normalizedQuery ||
                  matchesQuery(project.name, normalizedQuery),
              )
              .slice(0, limit)
              .map((project) => ({
                id: project.id,
                name: project.name,
                color: project.color,
              }));
          if (selectedKinds.size === 0 || selectedKinds.has("habit"))
            habits = state.habits
              .filter((habit) => isOwnedByMockAccount(habit, activeUserId))
              .filter(
                (habit) =>
                  !normalizedQuery || matchesQuery(habit.name, normalizedQuery),
              )
              .slice(0, limit)
              .map((habit) => ({
                id: habit.id,
                name: habit.name,
                color: habit.color,
              }));
          if (selectedKinds.size === 0 || selectedKinds.has("task"))
            tasks = state.tasks
              .filter((task) => isOwnedByMockAccount(task, activeUserId))
              .filter(
                (task) =>
                  !normalizedQuery ||
                  matchesQuery(task.content, normalizedQuery),
              )
              .slice(0, limit)
              .map((task) => ({
                id: task.id,
                content: task.content,
                priority: task.priority,
                due_date: task.due_date,
                is_completed: task.is_completed,
                project_id: task.project_id,
              }));
        } else if (nodeSupabaseClient) {
          if (selectedKinds.size === 0 || selectedKinds.has("project")) {
            let request = nodeSupabaseClient
              .from("projects")
              .select("id, name, color")
              .eq("user_id", activeUserId)
              .order("name", { ascending: true })
              .limit(limit);
            if (normalizedQuery)
              request = request.ilike("name", `%${normalizedQuery}%`);
            const { data, error } = await request;
            if (error)
              throw supabaseError("Could not inspect Projects.", error);
            projects = (data ?? []) as typeof projects;
          }
          if (selectedKinds.size === 0 || selectedKinds.has("habit")) {
            let request = nodeSupabaseClient
              .from("habits")
              .select("id, name, color")
              .eq("user_id", activeUserId)
              .order("name", { ascending: true })
              .limit(limit);
            if (normalizedQuery)
              request = request.ilike("name", `%${normalizedQuery}%`);
            const { data, error } = await request;
            if (error) throw supabaseError("Could not inspect Habits.", error);
            habits = (data ?? []) as typeof habits;
          }
          if (selectedKinds.size === 0 || selectedKinds.has("task")) {
            let request = nodeSupabaseClient
              .from("tasks")
              .select(
                "id, content, priority, due_date, is_completed, project_id",
              )
              .eq("user_id", activeUserId)
              .order("created_at", { ascending: false })
              .limit(limit);
            if (normalizedQuery)
              request = request.ilike("content", `%${normalizedQuery}%`);
            const { data, error } = await request;
            if (error) throw supabaseError("Could not inspect Tasks.", error);
            tasks = (data ?? []) as typeof tasks;
          }
        } else
          throw new WorkspaceMcpError(
            "authentication",
            "MCP Server is not connected.",
          );
        return operationResult({
          contractVersion: WORKSPACE_MCP_CONTRACT_VERSION,
          filter: {
            query: query ?? null,
            entityKinds: [...selectedKinds],
            limit,
          },
          projects,
          habits,
          recentTasks: tasks,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "get_workspace_blueprint",
    "Read the current Account-owned Workspace semantic snapshot before patching. Returns Markdown and structured state with current node/Connection IDs, groups, positions, sizes, orphan visibility, and visual-only edges; it never mutates data.",
    { workspaceId: z.string().min(1).describe("Account-owned Workspace ID.") },
    async ({ workspaceId }) => {
      try {
        await ensureAuthenticated();
        const state = await readWorkspaceState(workspaceId);
        const snapshot = await decompileWorkspaceToSnapshot(workspaceId, {
          workspace: state.workspace,
          nodes: state.nodes,
          edges: state.edges,
          getTask: (id) => resolveOwnedEntity("task", id, state.tasks),
          getProject: (id) => resolveOwnedEntity("project", id, state.projects),
          getHabit: (id) => resolveOwnedEntity("habit", id, state.habits),
        });
        return operationResult({
          contractVersion: WORKSPACE_MCP_CONTRACT_VERSION,
          markdown: formatSnapshotToMarkdown(snapshot),
          snapshot,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "build_workspace",
    "Create a new Workspace from the canonical blueprint object or Mermaid input. Inspect context first when reuse matters. Writes go through the Blueprint Engine and Domain Commands; optional requestId makes retries safe within this local MCP process. Returns a structured operation receipt and JSON text. Never use this to modify an existing Workspace. v1 supports doc, task, habit, project, focus, decision, and step; event nodes and runtime automation semantics are unsupported. Legacy flat name/color/sections/flows fields remain accepted with a warning.",
    {
      blueprint: WorkspaceBlueprintSchema.optional().describe(
        "Canonical structured WorkspaceBlueprint.",
      ),
      mermaid: z
        .string()
        .optional()
        .describe("Topology-first Mermaid flowchart input."),
      name: z
        .string()
        .optional()
        .describe("Legacy flat alias or Mermaid display name."),
      color: z
        .string()
        .optional()
        .describe("Legacy flat alias or Mermaid display color."),
      sections: z
        .array(z.unknown())
        .optional()
        .describe("Legacy flat sections alias."),
      flows: z
        .array(z.unknown())
        .optional()
        .describe("Legacy flat flows alias."),
      requestId: z
        .string()
        .min(1)
        .optional()
        .describe("Optional process-local idempotency key."),
      request_id: z
        .string()
        .min(1)
        .optional()
        .describe("Legacy request ID alias."),
    },
    async (args) => {
      try {
        const input = parseBuildInput(args);
        const outcome = await replaySafe(
          replayCache,
          inFlightRequests,
          "build_workspace",
          input.requestId,
          { inputForm: input.inputForm, blueprint: input.blueprint },
          () => executeBuild(input),
        );
        return operationResult({
          ...outcome.receipt,
          nodeCount: outcome.receipt.counts.nodes,
          edgeCount: outcome.receipt.counts.edges,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "patch_workspace",
    "Apply a localized patch to an existing Account-owned Workspace. First call get_workspace_blueprint and use its current IDs. Never rebuild to modify an existing canvas. Additions, in-place edits, removals, and visual connections stay in the patch; removals or broad batches require server-side destructiveConfirmation: true after user confirmation. Invalid ownership, references, ports, duplicate/self links, and unsupported event nodes fail before mutation. Optional requestId makes retries safe within this local MCP process. Returns a structured receipt plus JSON text; flat fields remain compatibility aliases. Visual Connections have no runtime automation semantics.",
    {
      patch: BlueprintPatchSchema.optional().describe(
        "Canonical structured BlueprintPatch.",
      ),
      workspaceId: z
        .string()
        .optional()
        .describe("Legacy flat workspace ID alias."),
      addItems: z.array(z.unknown()).optional(),
      removeNodeIds: z.array(z.string()).optional(),
      updateDocs: z.array(z.unknown()).optional(),
      updateDecisions: z.array(z.unknown()).optional(),
      updateSteps: z.array(z.unknown()).optional(),
      addFlows: z.array(z.unknown()).optional(),
      removeEdgeIds: z.array(z.string()).optional(),
      destructiveConfirmation: z
        .boolean()
        .optional()
        .describe("Required true for confirmed destructive/broad patches."),
      confirmed: z
        .boolean()
        .optional()
        .describe("Legacy alias for destructiveConfirmation."),
      requestId: z
        .string()
        .min(1)
        .optional()
        .describe("Optional process-local idempotency key."),
      request_id: z
        .string()
        .min(1)
        .optional()
        .describe("Legacy request ID alias."),
    },
    async (args) => {
      try {
        const input = parsePatchInput(args);
        const outcome = await replaySafe(
          replayCache,
          inFlightRequests,
          "patch_workspace",
          input.requestId,
          { inputForm: input.inputForm, patch: input.patch },
          () => executePatch(input),
        );
        return operationResult({
          ...outcome.receipt,
          ...(outcome.legacyResult ? { result: outcome.legacyResult } : {}),
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerPrompt(
    "workspace_builder_workflow",
    {
      title: "Kagelin Workspace Builder workflow",
      description:
        "Compact create/patch sequencing reference for generic MCP clients without Skill support.",
    },
    async () => ({
      description:
        "Use this compact workflow reference with the five Workspace MCP tools.",
      messages: [
        {
          role: "user",
          content: { type: "text", text: GENERIC_WORKSPACE_WORKFLOW_REFERENCE },
        },
      ],
    }),
  );

  return server;
}
