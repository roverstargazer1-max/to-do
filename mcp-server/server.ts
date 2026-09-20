import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { QueryClient } from "@tanstack/react-query";
import type Database from "better-sqlite3";
import { getDatabase } from "../src/lib/db/index";
import { TaskRepository } from "../src/lib/db/repositories/task-repository";
import { ProjectRepository } from "../src/lib/db/repositories/project-repository";
import { HabitRepository } from "../src/lib/db/repositories/habit-repository";
import { WorkspaceRepository } from "../src/lib/db/repositories/workspace-repository";
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
import { type BlueprintCommandAdapters } from "../src/lib/workspace/blueprint/commands";
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
import {
  VisualServiceError,
  VisualWorkspaceService,
  type VisualFlowCommitResult,
  type VisualRenderInput,
} from "../src/lib/visual/service";
import { InMemoryVisualAssetStore } from "../src/lib/visual/store";
import { assertSafeVisualUrl } from "../src/lib/visual/validation";
import { ssrfSafeFetch, SsrfBlockedError } from "../src/lib/webdav/ssrf-guard";
import type {
  VisualAnnotation,
  VisualAsset,
  VisualAssetVersion,
  VisualCrop,
  VisualDerivedInfo,
  VisualEndpointType,
  VisualFlowDraft,
  VisualRelation,
  VisualRelationType,
  VisualRepresentation,
  VisualTarget,
} from "../src/lib/types/visual";

const CONTEXT_LIMIT_MAX = 100;
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

interface VisualOperationOutcome {
  payload: Record<string, unknown>;
}

interface CachedVisualOperation {
  fingerprint: string;
  outcome?: VisualOperationOutcome;
  error?: WorkspaceMcpErrorPayload["error"];
}

type ReplayIdentitySource = {
  get: (requestId: string) => { fingerprint: string } | undefined;
};

interface ReplayIdentityLink {
  cache: ReplayIdentitySource;
  inFlight: ReplayIdentitySource;
}

const replayIdentityLinks = new WeakMap<object, ReplayIdentityLink>();

function assertNoCrossSurfaceRequestConflict(
  requestId: string | undefined,
  fingerprint: string,
  operation: string,
  cache?: ReplayIdentitySource,
  inFlight?: ReplayIdentitySource,
): void {
  if (!requestId) return;
  const cached = cache?.get(requestId);
  if (cached && cached.fingerprint !== fingerprint) {
    throw new WorkspaceMcpError(
      "request_conflict",
      `Request ID "${requestId}" was already used by another mutation with different input.`,
      { requestId, operation },
    );
  }
  const running = inFlight?.get(requestId);
  if (running && running.fingerprint !== fingerprint) {
    throw new WorkspaceMcpError(
      "request_conflict",
      `Request ID "${requestId}" is already running for another mutation with different input.`,
      { requestId, operation },
    );
  }
}

interface VisualImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

export interface McpServerOptions {
  /** Explicit Account identity for a real MCP process. */
  identity?: string;
  /** Alias for embedding/test callers that use user terminology. */
  userId?: string;
  useMockFallback?: boolean;
  initialWorkspaces?: Workspace[];
  initialNodes?: WorkspaceNode[];
  initialEdges?: WorkspaceEdge[];
  initialTasks?: Task[];
  initialProjects?: Project[];
  initialHabits?: Habit[];
  initialVisualAssets?: VisualAsset[];
  initialVisualVersions?: VisualAssetVersion[];
  initialVisualAnnotations?: VisualAnnotation[];
  initialVisualDerived?: VisualDerivedInfo[];
  initialVisualRelations?: VisualRelation[];
  initialVisualFlowDrafts?: VisualFlowDraft[];
  /** Custom SQLite database instance */
  db?: Database.Database;
  /** Custom SQLite database path */
  dbPath?: string;
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
    ...(options.initialVisualAssets ?? []),
    ...(options.initialVisualRelations ?? []),
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

function operationResult(
  payload: Record<string, unknown>,
  isError = false,
  extraContent: VisualImageContent[] = [],
) {
  const result = {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
      ...extraContent,
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

async function renderMcpVisual(
  input: VisualRenderInput,
): Promise<{ bytes: Uint8Array; mimeType?: string }> {
  const { default: sharp } = await import("sharp");
  let pipeline = sharp(Buffer.from(input.bytes), { failOn: "error" });
  if (input.representation === "thumbnail") {
    pipeline = pipeline.resize({
      width: 1024,
      height: 1024,
      fit: "inside",
      withoutEnlargement: true,
    });
  } else if (input.representation === "crop" && input.crop) {
    const left = Math.max(0, Math.floor(input.crop.x * input.width));
    const top = Math.max(0, Math.floor(input.crop.y * input.height));
    const width = Math.max(1, Math.floor(input.crop.width * input.width));
    const height = Math.max(1, Math.floor(input.crop.height * input.height));
    pipeline = pipeline.extract({ left, top, width, height });
  }
  const result = await pipeline.toBuffer({ resolveWithObject: true });
  const format = String(result.info.format || "").toLocaleLowerCase();
  const mimeType =
    format === "jpeg" || format === "jpg"
      ? "image/jpeg"
      : format === "png"
        ? "image/png"
        : format === "webp"
          ? "image/webp"
          : format === "gif"
            ? "image/gif"
            : input.mimeType;
  return { bytes: new Uint8Array(result.data), mimeType };
}

async function readVisualResponse(
  response: Awaited<ReturnType<typeof ssrfSafeFetch>>,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > maxBytes) {
      throw new VisualServiceError(
        "resource_too_large",
        "The visual URL response exceeds the configured asset limit.",
        { byteSize: bytes.length, maxBytes },
      );
    }
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = new Uint8Array(next.value);
      total += chunk.length;
      if (total > maxBytes) {
        await reader.cancel();
        throw new VisualServiceError(
          "resource_too_large",
          "The visual URL response exceeds the configured asset limit.",
          { byteSize: total, maxBytes },
        );
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
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
          `Node kind "${item.kind}" is not supported by the v1.2 Workspace MCP contract.`,
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
    (patch.updateImages?.length ?? 0) +
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
    ...(result.updatedImageNodeIds ?? []),
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
  crossCache?: ReplayIdentitySource,
  crossInFlight?: ReplayIdentitySource,
): Promise<OperationOutcome> {
  if (!requestId) return execute();
  const fingerprint = canonicalizeForReplay({ operation, canonicalInput });
  const linked = replayIdentityLinks.get(cache);
  assertNoCrossSurfaceRequestConflict(
    requestId,
    fingerprint,
    operation,
    crossCache ?? linked?.cache,
    crossInFlight ?? linked?.inFlight,
  );
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

async function replayVisualSafe(
  cache: Map<string, CachedVisualOperation>,
  inFlight: Map<
    string,
    { fingerprint: string; promise: Promise<VisualOperationOutcome> }
  >,
  operation: string,
  requestId: string | undefined,
  canonicalInput: unknown,
  execute: () => Promise<VisualOperationOutcome>,
  crossCache?: ReplayIdentitySource,
  crossInFlight?: ReplayIdentitySource,
): Promise<VisualOperationOutcome> {
  if (!requestId) return execute();
  const fingerprint = canonicalizeForReplay({ operation, canonicalInput });
  const linked = replayIdentityLinks.get(cache);
  assertNoCrossSurfaceRequestConflict(
    requestId,
    fingerprint,
    operation,
    crossCache ?? linked?.cache,
    crossInFlight ?? linked?.inFlight,
  );
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
      payload: {
        ...clone(cached.outcome.payload),
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
      payload: {
        ...clone(outcome.payload),
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
    version: "1.2.0",
  });
  const useMockFallback =
    options.useMockFallback ?? process.env.KAGELIN_MOCK_MODE === "true";
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
        visualAssets: options.initialVisualAssets,
        visualVersions: options.initialVisualVersions,
        visualAnnotations: options.initialVisualAnnotations,
        visualDerived: options.initialVisualDerived,
        visualRelations: options.initialVisualRelations,
        visualFlowDrafts: options.initialVisualFlowDrafts,
      })
    : null;
  // A request ID belongs to the whole MCP mutation surface, not to one tool.
  // Sharing both maps makes build↔patch reuse a conflict instead of allowing
  // two different operations to claim the same retry key.
  const replayCache = new Map<string, CachedOperation>();
  const inFlightRequests = new Map<string, InFlightRequest>();
  const visualReplayCache = new Map<string, CachedVisualOperation>();
  const visualInFlightRequests = new Map<
    string,
    { fingerprint: string; promise: Promise<VisualOperationOutcome> }
  >();
  replayIdentityLinks.set(replayCache, {
    cache: visualReplayCache,
    inFlight: visualInFlightRequests,
  });
  replayIdentityLinks.set(visualReplayCache, {
    cache: replayCache,
    inFlight: inFlightRequests,
  });

  let authPromise: Promise<void> | null = null;
  async function ensureAuthenticated(): Promise<void> {
    if (useMockFallback) return;
    if (!configuredIdentity) {
      throw new WorkspaceMcpError(
        "authentication",
        "MCP Server requires an explicit Account identity; no data was changed.",
      );
    }
    if (!authPromise) {
      authPromise = (async () => {
        const sqliteDb = options.db || getDatabase(options.dbPath);
        try {
          sqliteDb.prepare("SELECT 1").get();
        } catch {
          throw new WorkspaceMcpError(
            "authentication",
            "MCP Server could not open the local SQLite database; no data was changed.",
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

  let visualService: VisualWorkspaceService | null = null;

  async function commitVisualFlow(
    draft: VisualFlowDraft,
  ): Promise<VisualFlowCommitResult> {
    const adapters: BlueprintCommandAdapters | undefined =
      mockBackend?.commandAdapters;
    if (!adapters) {
      throw new VisualServiceError(
        "bridge_unavailable",
        "No Workspace command adapter is connected for flow writes.",
      );
    }
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const commandContext = {
      queryClient,
      isGuestMode: Boolean(mockBackend),
    };
    const createdNodeIds: string[] = [];
    const createdEdgeIds: string[] = [];
    try {
      for (const draftNode of draft.nodes) {
        const node = await adapters.node.add(commandContext, {
          id: draftNode.id,
          workspaceId: draft.workspace_id,
          kind: draftNode.kind,
          entityType: null,
          entityId: null,
          position: draftNode.position,
          width: draftNode.width ?? (draftNode.kind === "decision" ? 320 : 300),
          height:
            draftNode.height ?? (draftNode.kind === "decision" ? 180 : 150),
          displayConfig:
            draftNode.kind === "decision"
              ? {
                  question: draftNode.title,
                  description: draftNode.description ?? "",
                }
              : {
                  title: draftNode.title,
                  description: draftNode.description ?? "",
                },
        });
        createdNodeIds.push(node.id);
      }
      for (const draftEdge of draft.edges) {
        const edge = await adapters.edge.add(commandContext, {
          id: draftEdge.id,
          workspaceId: draft.workspace_id,
          sourceNodeId: draftEdge.fromNodeId,
          targetNodeId: draftEdge.toNodeId,
          label: draftEdge.label ?? null,
        });
        createdEdgeIds.push(edge.id);
      }
      return { createdNodeIds, createdEdgeIds };
    } catch (error) {
      for (const edgeId of [...createdEdgeIds].reverse()) {
        try {
          await adapters.edge.remove(commandContext, {
            id: edgeId,
            workspace_id: draft.workspace_id,
          });
        } catch {
          // Preserve the original commit failure; the domain adapter owns
          // its own cleanup/error reporting.
        }
      }
      for (const nodeId of [...createdNodeIds].reverse()) {
        try {
          await adapters.node.remove(commandContext, {
            id: nodeId,
            workspace_id: draft.workspace_id,
          });
        } catch {
          // Preserve the original commit failure.
        }
      }
      throw error;
    }
  }

  async function rollbackVisualFlow(
    draft: VisualFlowDraft,
    result: VisualFlowCommitResult,
  ): Promise<void> {
    const adapters = currentCommandAdapters();
    if (!adapters) {
      throw new VisualServiceError(
        "bridge_unavailable",
        "The Workspace command adapter disconnected before visual-flow rollback could finish.",
      );
    }
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const commandContext = {
      queryClient,
      isGuestMode: Boolean(mockBackend),
    };
    const failures: string[] = [];
    for (const edgeId of [...result.createdEdgeIds].reverse()) {
      try {
        await adapters.edge.remove(commandContext, {
          id: edgeId,
          workspace_id: draft.workspace_id,
        });
      } catch (error) {
        failures.push(
          `edge ${edgeId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    for (const nodeId of [...result.createdNodeIds].reverse()) {
      try {
        await adapters.node.remove(commandContext, {
          id: nodeId,
          workspace_id: draft.workspace_id,
        });
      } catch (error) {
        failures.push(
          `node ${nodeId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (failures.length > 0) {
      throw new Error(`Visual-flow rollback failed: ${failures.join("; ")}`);
    }
  }

  function getVisualService(): VisualWorkspaceService {
    if (visualService) return visualService;
    if (mockBackend) {
      visualService = new VisualWorkspaceService(mockBackend.visualStore, {
        userId: activeUserId,
        getWorkspace: (workspaceId) =>
          currentMockState().workspaces.find(
            (workspace) => workspace.id === workspaceId,
          ),
        listNodes: (workspaceId) =>
          currentMockState().nodes.filter(
            (node) => node.workspace_id === workspaceId,
          ),
        commitFlow: commitVisualFlow,
        rollbackFlow: rollbackVisualFlow,
        renderVisual: renderMcpVisual,
      });
      return visualService;
    }
    visualService = new VisualWorkspaceService(new InMemoryVisualAssetStore(), {
      userId: activeUserId,
      getWorkspace: async (workspaceId) => {
        const state = await readWorkspaceState(workspaceId);
        return state.workspace;
      },
      listNodes: async (workspaceId) => {
        const state = await readWorkspaceState(workspaceId);
        return state.nodes;
      },
      commitFlow: commitVisualFlow,
      rollbackFlow: rollbackVisualFlow,
      renderVisual: renderMcpVisual,
    });
    return visualService;
  }

  async function resolveVisualAssetForWorkspace(
    assetId: string,
    workspaceId: string,
    versionId?: string,
  ): Promise<{ assetId: string; versionId?: string }> {
    const service = getVisualService();
    const resolved = await service.resolveTarget({ workspaceId, assetId });
    if (!versionId) return { assetId: resolved.asset.id };
    const version = await service.store.getVersion(assetId, versionId);
    if (!version) {
      throw new VisualServiceError(
        "target_not_found",
        `Visual asset version "${versionId}" was not found.`,
        { assetId, versionId },
      );
    }
    return { assetId: resolved.asset.id, versionId: version.id };
  }

  async function resolveVisualAssetForBuild(
    assetId: string,
    _workspaceId: string,
    versionId?: string,
  ): Promise<{ assetId: string; versionId?: string }> {
    // A Visual asset is reusable by reference when building a new Workspace;
    // ownership and the optional version are still checked before any node is
    // written. Workspace-local mounting is represented by the new image node.
    const service = getVisualService();
    const resolved = await service.resolveTarget({ assetId });
    if (!versionId) return { assetId: resolved.asset.id };
    const version = await service.store.getVersion(assetId, versionId);
    if (!version) {
      throw new VisualServiceError(
        "target_not_found",
        `Visual asset version "${versionId}" was not found.`,
        { assetId, versionId },
      );
    }
    return { assetId: resolved.asset.id, versionId: version.id };
  }

  function currentCommandAdapters(): BlueprintCommandAdapters | undefined {
    return mockBackend?.commandAdapters;
  }

  async function fetchEntityRecord(
    kind: EntityKind,
    id: string,
    _fullRow = false,
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
    const sqliteDb = options.db || getDatabase(options.dbPath);
    if (kind === "task") {
      const row = new TaskRepository(sqliteDb).getById(id);
      if (!row) return undefined;
      return { id: row.id, user_id: row.user_id } as EntityRecord;
    }
    if (kind === "project") {
      const row = new ProjectRepository(sqliteDb).getById(id);
      if (!row) return undefined;
      return { id: row.id, user_id: row.user_id } as EntityRecord;
    }
    const row = new HabitRepository(sqliteDb).getById(id);
    if (!row) return undefined;
    return { id: row.id, user_id: row.user_id } as EntityRecord;
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
        if (
          edge.user_id &&
          edge.user_id !== activeUserId &&
          edge.user_id !== "guest"
        ) {
          throw new WorkspaceMcpError(
            "authorization",
            `Connection "${edge.id}" is not owned by the active Account.`,
            { edgeId: edge.id, workspaceId },
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
    const sqliteDb = options.db || getDatabase(options.dbPath);
    const state = new WorkspaceRepository(sqliteDb).getWorkspace(workspaceId);
    if (!state)
      throw new WorkspaceMcpError(
        "invalid_reference",
        `Workspace "${workspaceId}" was not found.`,
        { workspaceId },
      );
    const { workspace, nodes, edges } = state;
    // Single-user local database: rows owned by local_user/guest are treated
    // as the configured MCP identity's own data.
    if (
      workspace.user_id &&
      workspace.user_id !== activeUserId &&
      workspace.user_id !== "local_user" &&
      workspace.user_id !== "guest"
    ) {
      throw new WorkspaceMcpError(
        "authorization",
        `Workspace "${workspaceId}" belongs to another Account.`,
        { workspaceId },
      );
    }
    for (const node of nodes) {
      if (
        node.user_id &&
        node.user_id !== activeUserId &&
        node.user_id !== "local_user" &&
        node.user_id !== "guest"
      ) {
        throw new WorkspaceMcpError(
          "authorization",
          `Node "${node.id}" is not owned by the active Account.`,
          { nodeId: node.id, workspaceId },
        );
      }
    }
    for (const edge of edges) {
      if (
        edge.user_id &&
        edge.user_id !== activeUserId &&
        edge.user_id !== "local_user" &&
        edge.user_id !== "guest"
      ) {
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
      tasks: new TaskRepository(sqliteDb).list({
        userId: activeUserId,
        showCompleted: true,
      }),
      projects: new ProjectRepository(sqliteDb).list(activeUserId),
      habits: new HabitRepository(sqliteDb).list(activeUserId),
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
        if (item.kind === "image") {
          const service = getVisualService();
          const asset = await service.store.getAsset(item.assetId);
          if (!asset) {
            throw new VisualServiceError(
              "target_not_found",
              `Visual asset "${item.assetId}" was not found.`,
              { assetId: item.assetId },
            );
          }
          if (asset.user_id && asset.user_id !== activeUserId) {
            throw new VisualServiceError(
              "authorization",
              `Visual asset "${item.assetId}" belongs to another Account.`,
              { assetId: item.assetId },
            );
          }
          if (item.versionId) {
            const version = await service.store.getVersion(
              item.assetId,
              item.versionId,
            );
            if (!version) {
              throw new VisualServiceError(
                "target_not_found",
                `Visual asset version "${item.versionId}" was not found.`,
                { assetId: item.assetId, versionId: item.versionId },
              );
            }
          }
        }
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
    assertUniquePatchTargets(
      patch.updateImages?.map((update) => update.nodeId),
      "image updates",
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
    for (const update of patch.updateImages ?? []) {
      const target = nodesById.get(update.nodeId);
      if (target?.kind !== "image" || target.entity_type !== "visual_asset")
        throw new WorkspaceMcpError(
          "invalid_reference",
          `Image node "${update.nodeId}" is not a valid target.`,
          { nodeId: update.nodeId },
        );
      if (!target.entity_id)
        throw new WorkspaceMcpError(
          "invalid_reference",
          `Image node "${update.nodeId}" has no visual asset reference.`,
          { nodeId: update.nodeId },
        );
      await getVisualService().resolveTarget({
        workspaceId: patch.workspaceId,
        nodeId: update.nodeId,
      });
    }
    const removedNodeIds = new Set(patch.removeNodeIds ?? []);
    for (const update of [
      ...(patch.updateDocs ?? []),
      ...(patch.updateDecisions ?? []),
      ...(patch.updateSteps ?? []),
      ...(patch.updateImages ?? []),
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
          `Node kind "${add.item.kind}" is not supported by the v1.2 Workspace MCP contract.`,
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
      if (add.item.kind === "image") {
        await resolveVisualAssetForWorkspace(
          add.item.assetId,
          patch.workspaceId,
          add.item.versionId,
        );
      }
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
    const sqliteDb = options.db || getDatabase(options.dbPath);
    return (
      new ProjectRepository(sqliteDb)
        .list(activeUserId)
        .find(
          (project) =>
            project.name.trim().toLocaleLowerCase() === normalizedName,
        )?.id ?? undefined
    );
  }

  async function resolveHabitByName(name: string): Promise<string | undefined> {
    const normalizedName = name.trim().toLocaleLowerCase();
    if (mockBackend)
      return currentMockState().habits.find(
        (habit) =>
          isOwnedByMockAccount(habit, activeUserId) &&
          habit.name.trim().toLocaleLowerCase() === normalizedName,
      )?.id;
    const sqliteDb = options.db || getDatabase(options.dbPath);
    return (
      new HabitRepository(sqliteDb)
        .list(activeUserId)
        .find(
          (habit) => habit.name.trim().toLocaleLowerCase() === normalizedName,
        )?.id ?? undefined
    );
  }

  async function executeBuild(input: BuildInput): Promise<OperationOutcome> {
    await ensureAuthenticated();
    await validateBuild(input.blueprint);
    const result = await buildWorkspaceFromBlueprint(input.blueprint, {
      isGuestMode: Boolean(mockBackend),
      commandAdapters: currentCommandAdapters(),
      onResolveProject: resolveProjectByName,
      onResolveHabit: resolveHabitByName,
      onResolveVisualAsset: resolveVisualAssetForBuild,
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
      commandAdapters: currentCommandAdapters(),
      onResolveProject: resolveProjectByName,
      onResolveHabit: resolveHabitByName,
      onResolveVisualAsset: resolveVisualAssetForWorkspace,
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
    updateImages?: unknown[];
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
          updateImages: args.updateImages,
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

  function targetFromInput(
    input: {
      target?: Partial<VisualTarget>;
      workspaceId?: string;
      nodeId?: string;
      assetId?: string;
      resourceId?: string;
      title?: string;
    },
    options: { includeTitle?: boolean } = {},
  ): VisualTarget {
    return {
      workspaceId: input.workspaceId ?? input.target?.workspaceId,
      nodeId: input.nodeId ?? input.target?.nodeId,
      assetId: input.assetId ?? input.target?.assetId,
      resourceId: input.resourceId ?? input.target?.resourceId,
      ...(options.includeTitle === false
        ? {}
        : { title: input.title ?? input.target?.title }),
    };
  }

  function requestIdFromInput(input: {
    requestId?: string;
    request_id?: string;
  }): string | undefined {
    return input.requestId ?? input.request_id;
  }

  function visualSuccess(
    payload: Record<string, unknown>,
    requestId?: string,
  ): VisualOperationOutcome {
    return {
      payload: {
        success: true,
        contractVersion: WORKSPACE_MCP_CONTRACT_VERSION,
        requestId,
        status: "succeeded",
        replayed: false,
        ...payload,
      },
    };
  }

  function visualCommandContext(): {
    queryClient: QueryClient;
    isGuestMode: boolean;
  } {
    return {
      queryClient: new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      }),
      isGuestMode: Boolean(mockBackend),
    };
  }

  function visualAdapters(): BlueprintCommandAdapters {
    const adapters = currentCommandAdapters();
    if (!adapters) {
      throw new VisualServiceError(
        "bridge_unavailable",
        "No Workspace command adapter is connected for visual-flow writes.",
      );
    }
    return adapters;
  }

  function decodeBase64(value: unknown): Uint8Array {
    if (value instanceof Uint8Array) return value.slice();
    if (
      Array.isArray(value) &&
      value.every(
        (item) =>
          Number.isInteger(item) &&
          (item as number) >= 0 &&
          (item as number) <= 255,
      )
    ) {
      return Uint8Array.from(value as number[]);
    }
    if (typeof value !== "string" || !value.trim()) {
      throw new VisualServiceError(
        "invalid_input",
        "An explicit base64 image payload is required for this import source.",
      );
    }
    const raw = value.includes(",")
      ? value.slice(value.indexOf(",") + 1)
      : value;
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(raw) || raw.length % 4 === 1) {
      throw new VisualServiceError(
        "invalid_input",
        "The image base64 payload is invalid.",
      );
    }
    return new Uint8Array(Buffer.from(raw, "base64"));
  }

  async function bytesFromImportSource(input: {
    source?: unknown;
    sourceType?: string;
    data?: unknown;
    base64?: unknown;
    url?: string;
    assetId?: string;
    versionId?: string;
    mimeType?: string;
  }): Promise<{
    bytes?: Uint8Array;
    mimeType?: string;
    source: "url" | "asset-handle" | "upload" | "local-file";
    sourceUri?: string | null;
    sourceAssetId?: string | null;
  }> {
    const sourceObject =
      input.source && typeof input.source === "object"
        ? (input.source as Record<string, unknown>)
        : undefined;
    const sourceType = String(
      sourceObject?.type ??
        input.sourceType ??
        (input.url ? "url" : input.assetId ? "asset-handle" : "base64"),
    );
    const data =
      sourceObject?.data ?? sourceObject?.base64 ?? input.data ?? input.base64;
    const url = String(sourceObject?.url ?? input.url ?? "");
    const assetId = String(sourceObject?.assetId ?? input.assetId ?? "");
    const versionId = String(sourceObject?.versionId ?? input.versionId ?? "");
    const mimeType =
      String(sourceObject?.mimeType ?? input.mimeType ?? "") || undefined;

    if (
      sourceType === "base64" ||
      sourceType === "bytes" ||
      sourceType === "upload"
    ) {
      return { bytes: decodeBase64(data), mimeType, source: "upload" };
    }
    if (sourceType === "local-file" || sourceType === "local_file") {
      return { bytes: decodeBase64(data), mimeType, source: "local-file" };
    }
    if (sourceType === "asset-handle" || sourceType === "asset_handle") {
      if (!assetId)
        throw new VisualServiceError(
          "invalid_input",
          "asset-handle import requires assetId.",
        );
      const service = getVisualService();
      const resolved = await service.resolveTarget({ assetId });
      const bytes = await service.readVersion(
        resolved.asset.id,
        versionId || undefined,
      );
      const version = await service.store.getVersion(
        resolved.asset.id,
        versionId || undefined,
      );
      return {
        bytes,
        mimeType: version?.mime_type ?? resolved.asset.mime_type,
        source: "asset-handle",
        sourceAssetId: resolved.asset.id,
      };
    }
    if (sourceType === "url" || sourceType === "https") {
      if (!url)
        throw new VisualServiceError(
          "invalid_input",
          "URL import requires url.",
        );
      const parsed = assertSafeVisualUrl(url);
      const maxBytes = getVisualService().limits.maxBytes;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      let response: Awaited<ReturnType<typeof ssrfSafeFetch>>;
      let fetched: Uint8Array;
      try {
        response = await ssrfSafeFetch(parsed.toString(), {
          method: "GET",
          headers: new Headers(),
          signal: controller.signal,
        });
        if (response.status >= 300 && response.status < 400) {
          throw new VisualServiceError(
            "invalid_input",
            "Visual URL redirects are not allowed; provide the final public HTTPS image URL.",
            { url: parsed.toString(), status: response.status },
          );
        }
        if (!response.ok) {
          throw new VisualServiceError(
            "execution",
            `Visual URL returned HTTP ${response.status}.`,
            { url: parsed.toString(), status: response.status },
          );
        }
        const contentLength = Number(
          response.headers.get("content-length") ?? 0,
        );
        if (Number.isFinite(contentLength) && contentLength > maxBytes) {
          throw new VisualServiceError(
            "resource_too_large",
            "The visual URL is larger than the configured asset limit.",
            { contentLength, maxBytes },
          );
        }
        fetched = await readVisualResponse(response, maxBytes);
      } catch (error) {
        if (error instanceof VisualServiceError) throw error;
        if (error instanceof SsrfBlockedError) {
          throw new VisualServiceError(
            "invalid_input",
            "The visual URL resolves to a private or otherwise disallowed network address.",
            { url: parsed.toString() },
          );
        }
        if (controller.signal.aborted) {
          throw new VisualServiceError(
            "execution",
            "The visual URL request timed out before the image was fully read.",
            { url: parsed.toString(), timeoutMs: 15_000 },
          );
        }
        throw new VisualServiceError(
          "execution",
          "The visual URL could not be read.",
          {
            url: parsed.toString(),
            cause: error instanceof Error ? error.message : String(error),
          },
        );
      } finally {
        clearTimeout(timeout);
      }
      return {
        bytes: fetched,
        mimeType: mimeType ?? response.headers.get("content-type") ?? undefined,
        source: "url",
        sourceUri: parsed.toString(),
      };
    }
    throw new VisualServiceError(
      "invalid_input",
      `Import source "${sourceType}" is not supported. Use an explicit base64 payload, public HTTPS URL, or asset handle.`,
    );
  }

  async function addImageReferenceThroughCommands(input: {
    workspaceId: string;
    assetId: string;
    versionId: string;
    nodeId?: string;
    position?: { x: number; y: number };
    title?: string | null;
    role?: string;
    altText?: string | null;
  }): Promise<WorkspaceNode> {
    const service = getVisualService();
    const asset = await service.store.getAsset(input.assetId);
    if (!asset) {
      throw new VisualServiceError(
        "asset_not_found",
        `Visual asset "${input.assetId}" was not found.`,
        { assetId: input.assetId },
      );
    }
    const adapters = visualAdapters();
    return adapters.node.add(visualCommandContext(), {
      id: input.nodeId,
      workspaceId: input.workspaceId,
      kind: "image",
      entityType: "visual_asset",
      entityId: input.assetId,
      position: input.position ?? { x: 0, y: 0 },
      width: 320,
      height: 240,
      displayConfig: {
        title: input.title ?? asset.title ?? "",
        role: input.role ?? "",
        altText: input.altText ?? asset.alt_text ?? "",
        versionId: input.versionId,
      },
    });
  }

  function imageCapability(input: {
    supportsImage?: boolean;
    supportsImages?: boolean;
    supportsImageContent?: boolean;
    clientCapabilities?: { supportsImage?: boolean; supportsImages?: boolean };
  }): boolean {
    const values = [
      input.supportsImage,
      input.supportsImages,
      input.supportsImageContent,
      input.clientCapabilities?.supportsImage,
      input.clientCapabilities?.supportsImages,
    ].filter((value): value is boolean => value !== undefined);
    return values.length === 0 || values.every(Boolean);
  }

  async function visualFallback(
    service: VisualWorkspaceService,
    descriptor: Awaited<ReturnType<VisualWorkspaceService["describeVisual"]>>,
  ): Promise<Record<string, unknown>> {
    const derived = await service.store.listDerived(
      descriptor.assetId,
      descriptor.currentVersionId,
    );
    const usable = derived
      .filter((item) => item.status === "ready")
      .map((item) => ({
        kind: item.kind,
        value: item.value,
        confidence: item.confidence ?? null,
        versionId: item.version_id,
      }));
    return {
      equivalentToImage: false,
      reason:
        "This client did not declare MCP image-content support; the following text is metadata or derived information, not equivalent visual understanding.",
      metadata: descriptor,
      derived: usable,
      nextAction:
        "Use a client with image-content support or request OCR/description explicitly.",
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
        else workspaces = workspaceRepo.listWorkspaces(activeUserId);
        const state = mockBackend ? currentMockState() : null;
        const summaries = workspaces.map((workspace) => ({
          id: workspace.id,
          name: workspace.name,
          color: workspace.color,
          nodeCount: mockBackend
            ? (state?.nodes.filter(
                (node) =>
                  node.workspace_id === workspace.id &&
                  isOwnedByMockAccount(node, activeUserId),
              ).length ?? 0)
            : (workspaceRepo.getWorkspace(workspace.id)?.nodes.length ?? 0),
        }));
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
        } else {
          const sqliteDb = options.db || getDatabase(options.dbPath);
          if (selectedKinds.size === 0 || selectedKinds.has("project")) {
            const q = normalizedQuery
              ? normalizedQuery.toLocaleLowerCase()
              : "";
            projects = new ProjectRepository(sqliteDb)
              .list(activeUserId)
              .filter(
                (project) => !q || project.name.toLocaleLowerCase().includes(q),
              )
              .slice(0, limit)
              .map((project) => ({
                id: project.id,
                name: project.name,
                color: project.color ?? "",
              }));
          }
          if (selectedKinds.size === 0 || selectedKinds.has("habit")) {
            const q = normalizedQuery
              ? normalizedQuery.toLocaleLowerCase()
              : "";
            habits = new HabitRepository(sqliteDb)
              .list(activeUserId)
              .filter(
                (habit) => !q || habit.name.toLocaleLowerCase().includes(q),
              )
              .slice(0, limit)
              .map((habit) => ({
                id: habit.id,
                name: habit.name,
                color: habit.color ?? undefined,
              }));
          }
          if (selectedKinds.size === 0 || selectedKinds.has("task")) {
            const q = normalizedQuery
              ? normalizedQuery.toLocaleLowerCase()
              : "";
            tasks = new TaskRepository(sqliteDb)
              .list({ userId: activeUserId, showCompleted: true })
              .filter(
                (task) => !q || task.content.toLocaleLowerCase().includes(q),
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
          }
        }
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
    "Read the current Account-owned Workspace semantic snapshot before patching. Returns Markdown and structured state with current node/Connection IDs, groups, positions, sizes, orphan visibility, lightweight image descriptors, Visual relations, and visual-only edges; it never mutates data or image bytes.",
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
          getVisualAsset: async (id) => {
            const asset = await getVisualService().store.getAsset(id);
            if (!asset) return null;
            if (asset.user_id && asset.user_id !== activeUserId) {
              throw new VisualServiceError(
                "authorization",
                `Visual asset "${id}" belongs to another Account.`,
                { assetId: id, workspaceId },
              );
            }
            const mounted = state.nodes.some(
              (node) =>
                node.kind === "image" &&
                node.entity_type === "visual_asset" &&
                node.entity_id === id,
            );
            if (
              !mounted &&
              asset.workspace_id &&
              asset.workspace_id !== workspaceId
            ) {
              return null;
            }
            return asset;
          },
          getVisualRelations: (id) => getVisualService().listRelations(id),
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
    "Create a new Workspace from the canonical blueprint object or Mermaid input. Inspect context first when reuse matters. Writes go through the Blueprint Engine and Domain Commands; optional requestId makes retries safe within this local MCP process. Returns a structured operation receipt and JSON text. Never use this to modify an existing Workspace. Contract 1.2 supports doc, task, habit, project, focus, decision, step, and image asset references; event nodes and runtime automation semantics are unsupported. Legacy flat name/color/sections/flows fields remain accepted with a warning.",
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
      updateImages: z.array(z.unknown()).optional(),
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

  server.tool(
    "inspect_visual",
    "Inspect one explicitly targeted Visual asset or image node. The default is a lightweight descriptor; request representation thumbnail, crop, or original only when the client needs image bytes. Canvas selection is never used. Clients without image-content support receive an honest metadata/OCR/description fallback.",
    {
      target: z
        .object({
          workspaceId: z.string().min(1).optional(),
          nodeId: z.string().min(1).optional(),
          assetId: z.string().min(1).optional(),
          resourceId: z.string().min(1).optional(),
          title: z.string().min(1).optional(),
        })
        .optional(),
      workspaceId: z.string().min(1).optional(),
      nodeId: z.string().min(1).optional(),
      assetId: z.string().min(1).optional(),
      resourceId: z.string().min(1).optional(),
      title: z.string().min(1).optional(),
      representation: z.enum(["thumbnail", "crop", "original"]).optional(),
      crop: z
        .object({
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
          coordinateSpace: z.enum(["normalized", "pixels"]).optional(),
        })
        .optional(),
      versionId: z.string().min(1).optional(),
      expectedVersionId: z.string().min(1).optional(),
      maxResponseBytes: z.number().int().positive().optional(),
      purpose: z.string().max(500).optional(),
      supportsImage: z.boolean().optional(),
      supportsImages: z.boolean().optional(),
      supportsImageContent: z.boolean().optional(),
      clientCapabilities: z
        .object({
          supportsImage: z.boolean().optional(),
          supportsImages: z.boolean().optional(),
        })
        .optional(),
      requestId: z.string().min(1).optional(),
      request_id: z.string().min(1).optional(),
    },
    async (args) => {
      try {
        await ensureAuthenticated();
        const service = getVisualService();
        const target = targetFromInput(args);
        const descriptor = await service.describeVisual(target);
        const supportsImage = imageCapability(args);
        if (!supportsImage) {
          return operationResult(
            visualSuccess(
              {
                operation: "inspect_visual",
                target,
                purpose: args.purpose ?? null,
                descriptor,
                fallback: await visualFallback(service, descriptor),
              },
              requestIdFromInput(args),
            ).payload,
          );
        }
        const inspection = await service.inspectVisual(target, {
          representation: args.representation as
            VisualRepresentation | undefined,
          crop: args.crop as VisualCrop | undefined,
          versionId: args.versionId,
          expectedVersionId: args.expectedVersionId,
          maxResponseBytes: args.maxResponseBytes,
        });
        const payload = visualSuccess(
          {
            operation: "inspect_visual",
            target,
            purpose: args.purpose ?? null,
            descriptor,
            representation: inspection.representation,
            crop: inspection.crop ?? null,
            version: inspection.version,
            transformed: inspection.transformed,
          },
          requestIdFromInput(args),
        ).payload;
        return operationResult(payload, false, [
          {
            type: "image",
            data: Buffer.from(inspection.bytes).toString("base64"),
            mimeType:
              inspection.responseMimeType ?? inspection.version.mime_type,
          },
        ]);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "import_visual",
    "Import a visual asset from an explicit base64 payload, public HTTPS URL, or already authorized asset handle. The operation may create or mount one image node; replacing an existing asset always requires confirmed: true and creates an immutable new version.",
    {
      workspaceId: z.string().min(1),
      source: z
        .union([
          z.enum([
            "base64",
            "bytes",
            "upload",
            "local-file",
            "url",
            "asset-handle",
          ]),
          z.object({
            type: z.string(),
            data: z.any().optional(),
            base64: z.any().optional(),
            url: z.string().optional(),
            assetId: z.string().optional(),
            versionId: z.string().optional(),
            mimeType: z.string().optional(),
          }),
        ])
        .optional(),
      sourceType: z.string().optional(),
      data: z.any().optional(),
      base64: z.any().optional(),
      url: z.string().optional(),
      assetId: z.string().optional(),
      versionId: z.string().optional(),
      mimeType: z.string().optional(),
      createNode: z.boolean().optional(),
      nodeId: z.string().min(1).optional(),
      position: z.object({ x: z.number(), y: z.number() }).optional(),
      title: z.string().optional(),
      role: z.string().optional(),
      altText: z.string().optional(),
      deduplicate: z.boolean().optional(),
      replaceAssetId: z.string().optional(),
      replaceNodeId: z.string().optional(),
      expectedVersionId: z.string().optional(),
      confirmed: z.boolean().optional(),
      requireConfirmation: z.boolean().optional(),
      requestId: z.string().min(1).optional(),
      request_id: z.string().min(1).optional(),
    },
    async (args) => {
      try {
        await ensureAuthenticated();
        const requestId = requestIdFromInput(args);
        const source = args.source;
        const sourceObject =
          source && typeof source === "object"
            ? (source as Record<string, unknown>)
            : undefined;
        const sourceType = String(
          sourceObject?.type ??
            args.sourceType ??
            (args.url ? "url" : args.assetId ? "asset-handle" : "base64"),
        );
        const canonicalInput = {
          workspaceId: args.workspaceId,
          source,
          sourceType: args.sourceType,
          data: args.data,
          base64: args.base64,
          url: args.url,
          assetId: args.assetId,
          versionId: args.versionId,
          mimeType: args.mimeType,
          createNode: args.createNode,
          nodeId: args.nodeId,
          position: args.position,
          title: args.title,
          role: args.role,
          altText: args.altText,
          deduplicate: args.deduplicate,
          replaceAssetId: args.replaceAssetId,
          replaceNodeId: args.replaceNodeId,
          expectedVersionId: args.expectedVersionId,
          confirmed: args.confirmed,
        };
        const outcome = await replayVisualSafe(
          visualReplayCache,
          visualInFlightRequests,
          "import_visual",
          requestId,
          canonicalInput,
          async () => {
            const service = getVisualService();
            if (args.requireConfirmation && args.confirmed !== true) {
              throw new VisualServiceError(
                "confirmation_required",
                "This visual import is waiting for explicit user confirmation; retry with confirmed: true.",
                { workspaceId: args.workspaceId, operation: "import_visual" },
              );
            }
            if (args.replaceAssetId) {
              if (args.confirmed !== true) {
                throw new VisualServiceError(
                  "confirmation_required",
                  "Replacing a visual asset creates a new immutable version and requires confirmed: true.",
                  { assetId: args.replaceAssetId, operation: "import_visual" },
                );
              }
              const sourceResult = await bytesFromImportSource({
                source: args.source,
                sourceType: args.sourceType,
                data: args.data,
                base64: args.base64,
                url: args.url,
                assetId: args.assetId,
                versionId: args.versionId,
                mimeType: args.mimeType,
              });
              if (!sourceResult.bytes) {
                throw new VisualServiceError(
                  "invalid_input",
                  "Replacement source did not provide image bytes.",
                );
              }
              const replaced = await service.replaceVersion({
                assetId: args.replaceAssetId,
                bytes: sourceResult.bytes,
                mimeType: sourceResult.mimeType,
                source: sourceResult.source,
                sourceUri: sourceResult.sourceUri,
                sourceAssetId: sourceResult.sourceAssetId,
                expectedVersionId: args.expectedVersionId,
              });
              const nodeId = args.replaceNodeId;
              if (nodeId) {
                const adapters = visualAdapters();
                await adapters.node.updateImageNode?.(visualCommandContext(), {
                  workspaceId: args.workspaceId,
                  nodeId,
                  versionId: replaced.version.id,
                });
              }
              return visualSuccess(
                {
                  operation: "import_visual",
                  mode: "replace-version",
                  asset: replaced.asset,
                  version: replaced.version,
                  nodeId: nodeId ?? null,
                },
                requestId,
              );
            }

            const isAssetHandle =
              sourceType === "asset-handle" || sourceType === "asset_handle";
            if (isAssetHandle) {
              const sourceAssetId = String(
                sourceObject?.assetId ?? args.assetId ?? "",
              );
              if (!sourceAssetId) {
                throw new VisualServiceError(
                  "invalid_input",
                  "asset-handle import requires assetId.",
                );
              }
              const resolved = await service.resolveTarget({
                workspaceId: args.workspaceId,
                assetId: sourceAssetId,
              });
              const version = await service.store.getVersion(
                resolved.asset.id,
                String(sourceObject?.versionId ?? args.versionId ?? "") ||
                  undefined,
              );
              if (!version) {
                throw new VisualServiceError(
                  "target_not_found",
                  "The asset-handle version was not found.",
                  { assetId: sourceAssetId, versionId: args.versionId ?? null },
                );
              }
              const node =
                args.createNode === false
                  ? null
                  : await addImageReferenceThroughCommands({
                      workspaceId: args.workspaceId,
                      assetId: resolved.asset.id,
                      versionId: version.id,
                      nodeId: args.nodeId,
                      position: args.position,
                      title: args.title,
                      role: args.role,
                      altText: args.altText,
                    });
              return visualSuccess(
                {
                  operation: "import_visual",
                  mode: "mount-existing-asset",
                  asset: resolved.asset,
                  version,
                  node: node ?? null,
                },
                requestId,
              );
            }

            const sourceResult = await bytesFromImportSource({
              source: args.source,
              sourceType: args.sourceType,
              data: args.data,
              base64: args.base64,
              url: args.url,
              assetId: args.assetId,
              versionId: args.versionId,
              mimeType: args.mimeType,
            });
            if (!sourceResult.bytes) {
              throw new VisualServiceError(
                "invalid_input",
                "Import source did not provide image bytes.",
              );
            }
            const created = await service.ingest({
              workspaceId: args.workspaceId,
              bytes: sourceResult.bytes,
              mimeType: sourceResult.mimeType,
              source: sourceResult.source,
              sourceUri: sourceResult.sourceUri,
              title: args.title,
              altText: args.altText,
              deduplicate: args.deduplicate,
            });
            try {
              const node =
                args.createNode === false
                  ? null
                  : await addImageReferenceThroughCommands({
                      workspaceId: args.workspaceId,
                      assetId: created.asset.id,
                      versionId: created.version.id,
                      nodeId: args.nodeId,
                      position: args.position,
                      title: args.title,
                      role: args.role,
                      altText: args.altText,
                    });
              return visualSuccess(
                {
                  operation: "import_visual",
                  mode: created.reused ? "reuse-asset" : "create-asset",
                  asset: created.asset,
                  version: created.version,
                  node: node ?? null,
                },
                requestId,
              );
            } catch (error) {
              if (!created.reused)
                await service.store.removeAsset(created.asset.id);
              throw error;
            }
          },
        );
        return operationResult(outcome.payload);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "update_visual",
    "Apply non-destructive Visual asset changes: image-node metadata, asset metadata, version-bound annotations, or an explicitly confirmed immutable version replacement. The original version is never overwritten and expectedVersionId detects concurrent changes.",
    {
      target: z
        .object({
          workspaceId: z.string().min(1).optional(),
          nodeId: z.string().min(1).optional(),
          assetId: z.string().min(1).optional(),
          resourceId: z.string().min(1).optional(),
          title: z.string().min(1).optional(),
        })
        .optional(),
      workspaceId: z.string().min(1).optional(),
      nodeId: z.string().min(1).optional(),
      assetId: z.string().min(1).optional(),
      resourceId: z.string().min(1).optional(),
      title: z.string().optional(),
      role: z.string().optional(),
      altText: z.string().optional(),
      description: z.string().optional(),
      sourceUri: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
      versionId: z.string().optional(),
      expectedVersionId: z.string().optional(),
      annotation: z.any().optional(),
      replacement: z
        .object({
          source: z.any().optional(),
          sourceType: z.string().optional(),
          data: z.any().optional(),
          base64: z.any().optional(),
          url: z.string().optional(),
          assetId: z.string().optional(),
          versionId: z.string().optional(),
          mimeType: z.string().optional(),
        })
        .optional(),
      confirmed: z.boolean().optional(),
      requestId: z.string().min(1).optional(),
      request_id: z.string().min(1).optional(),
    },
    async (args) => {
      try {
        await ensureAuthenticated();
        const requestId = requestIdFromInput(args);
        const hasExplicitIdentifier = Boolean(
          args.nodeId ??
          args.assetId ??
          args.resourceId ??
          args.target?.nodeId ??
          args.target?.assetId ??
          args.target?.resourceId,
        );
        const target = targetFromInput(args, {
          includeTitle: !hasExplicitIdentifier,
        });
        const outcome = await replayVisualSafe(
          visualReplayCache,
          visualInFlightRequests,
          "update_visual",
          requestId,
          {
            target,
            title: args.title,
            role: args.role,
            altText: args.altText,
            description: args.description,
            sourceUri: args.sourceUri,
            metadata: args.metadata,
            versionId: args.versionId,
            expectedVersionId: args.expectedVersionId,
            annotation: args.annotation,
            replacement: args.replacement,
            confirmed: args.confirmed,
          },
          async () => {
            const service = getVisualService();
            const resolved = await service.resolveTarget(target);
            const hasReplacement = Boolean(args.replacement);
            if (hasReplacement && args.confirmed !== true) {
              throw new VisualServiceError(
                "confirmation_required",
                "Replacing a visual asset creates a new immutable version and requires confirmed: true.",
                { assetId: resolved.asset.id, operation: "update_visual" },
              );
            }

            let asset = resolved.asset;
            let replacement: {
              asset: VisualAsset;
              version: VisualAssetVersion;
            } | null = null;
            if (args.replacement) {
              const sourceResult = await bytesFromImportSource(
                args.replacement,
              );
              if (!sourceResult.bytes) {
                throw new VisualServiceError(
                  "invalid_input",
                  "Replacement source did not provide image bytes.",
                );
              }
              replacement = await service.replaceVersion({
                assetId: resolved.asset.id,
                bytes: sourceResult.bytes,
                mimeType: sourceResult.mimeType,
                source: sourceResult.source,
                sourceUri: sourceResult.sourceUri,
                sourceAssetId: sourceResult.sourceAssetId,
                expectedVersionId: args.expectedVersionId,
              });
              asset = replacement.asset;
            }

            const hasAssetMetadata =
              args.title !== undefined ||
              args.altText !== undefined ||
              args.sourceUri !== undefined ||
              args.metadata !== undefined ||
              args.description !== undefined;
            if (hasAssetMetadata) {
              asset = await service.updateMetadata(
                asset.id,
                {
                  ...(args.title !== undefined ? { title: args.title } : {}),
                  ...(args.altText !== undefined
                    ? { altText: args.altText }
                    : {}),
                  ...(args.sourceUri !== undefined
                    ? { sourceUri: args.sourceUri }
                    : {}),
                  ...(args.metadata !== undefined ||
                  args.description !== undefined
                    ? {
                        metadata: {
                          ...(asset.metadata ?? {}),
                          ...(args.metadata ?? {}),
                          ...(args.description !== undefined
                            ? { description: args.description }
                            : {}),
                        },
                      }
                    : {}),
                },
                replacement ? undefined : args.expectedVersionId,
              );
            }

            let annotation: VisualAnnotation | null = null;
            if (args.annotation) {
              if (!target.workspaceId) {
                throw new VisualServiceError(
                  "invalid_input",
                  "workspaceId is required when adding a visual annotation.",
                );
              }
              annotation = await service.addAnnotation({
                ...(args.annotation as Record<string, unknown>),
                workspaceId: target.workspaceId,
                assetId: asset.id,
                versionId: (args.annotation as Record<string, unknown>)
                  .versionId as string | undefined,
              } as Parameters<VisualWorkspaceService["addAnnotation"]>[0]);
            }

            const nodeId = resolved.node?.id ?? target.nodeId ?? args.nodeId;
            if (
              !nodeId &&
              (args.role !== undefined || args.versionId !== undefined)
            ) {
              throw new VisualServiceError(
                "invalid_input",
                "nodeId is required for image-node role or version changes.",
              );
            }
            const hasNodeMetadata =
              Boolean(nodeId) &&
              (args.title !== undefined ||
                args.role !== undefined ||
                args.altText !== undefined ||
                args.versionId !== undefined ||
                replacement !== null);
            if (hasNodeMetadata) {
              if (!nodeId) {
                throw new VisualServiceError(
                  "invalid_input",
                  "nodeId is required for image-node metadata changes.",
                );
              }
              const versionId = replacement?.version.id ?? args.versionId;
              if (versionId) {
                const version = await service.store.getVersion(
                  asset.id,
                  versionId,
                );
                if (!version) {
                  throw new VisualServiceError(
                    "target_not_found",
                    `Visual asset version "${versionId}" was not found.`,
                    { assetId: asset.id, versionId },
                  );
                }
              }
              const adapters = visualAdapters();
              if (!adapters.node.updateImageNode) {
                throw new VisualServiceError(
                  "execution",
                  "The image-node Domain Command adapter is unavailable.",
                );
              }
              await adapters.node.updateImageNode(visualCommandContext(), {
                workspaceId: target.workspaceId ?? asset.workspace_id ?? "",
                nodeId,
                title: args.title,
                role: args.role,
                altText: args.altText,
                versionId: versionId ?? undefined,
              });
            }
            return visualSuccess(
              {
                operation: "update_visual",
                asset,
                version: replacement?.version ?? null,
                nodeId: nodeId ?? null,
                annotation,
              },
              requestId,
            );
          },
        );
        return operationResult(outcome.payload);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "list_visual_relations",
    "List typed, non-executing Visual relations for one Account-owned Workspace. Relations are separate from visual-only canvas Connections and never trigger tasks, scheduling, or automation.",
    {
      workspaceId: z.string().min(1),
      requestId: z.string().min(1).optional(),
      request_id: z.string().min(1).optional(),
    },
    async ({ workspaceId, requestId, request_id }) => {
      try {
        await ensureAuthenticated();
        const relations = await getVisualService().listRelations(workspaceId);
        return operationResult(
          visualSuccess(
            {
              operation: "list_visual_relations",
              workspaceId,
              relations,
            },
            requestId ?? request_id,
          ).payload,
        );
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "create_visual_relation",
    "Create a directional reference, supports, evidence-for, or derived-from relation between a Visual asset/image node and an existing Workspace object. Endpoint, Workspace, Account, and version context are validated; this does not create a runtime Connection.",
    {
      workspaceId: z.string().min(1),
      relationType: z.enum([
        "reference",
        "supports",
        "evidence-for",
        "derived-from",
      ]),
      sourceType: z.enum([
        "visual_asset",
        "image_node",
        "workspace_node",
        "step",
        "decision",
        "doc",
        "task",
        "habit",
        "project",
        "focus",
      ]),
      sourceId: z.string().min(1),
      targetType: z.enum([
        "visual_asset",
        "image_node",
        "workspace_node",
        "step",
        "decision",
        "doc",
        "task",
        "habit",
        "project",
        "focus",
      ]),
      targetId: z.string().min(1),
      sourceVersionId: z.string().optional(),
      targetVersionId: z.string().optional(),
      description: z.string().optional(),
      relationId: z.string().optional(),
      requestId: z.string().min(1).optional(),
      request_id: z.string().min(1).optional(),
    },
    async (args) => {
      try {
        await ensureAuthenticated();
        const requestId = requestIdFromInput(args);
        const outcome = await replayVisualSafe(
          visualReplayCache,
          visualInFlightRequests,
          "create_visual_relation",
          requestId,
          args,
          async () =>
            visualSuccess(
              {
                operation: "create_visual_relation",
                relation: await getVisualService().createRelation({
                  workspaceId: args.workspaceId,
                  relationType: args.relationType as VisualRelationType,
                  sourceType: args.sourceType as VisualEndpointType,
                  sourceId: args.sourceId,
                  targetType: args.targetType as VisualEndpointType,
                  targetId: args.targetId,
                  sourceVersionId: args.sourceVersionId ?? null,
                  targetVersionId: args.targetVersionId ?? null,
                  description: args.description ?? null,
                  relationId: args.relationId,
                }),
              },
              requestId,
            ),
        );
        return operationResult(outcome.payload);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "update_visual_relation",
    "Update a typed Visual relation after revalidating both endpoints and optional expectedUpdatedAt concurrency condition. The relation remains non-executing.",
    {
      workspaceId: z.string().min(1),
      relationId: z.string().min(1),
      relationType: z
        .enum(["reference", "supports", "evidence-for", "derived-from"])
        .optional(),
      sourceType: z
        .enum([
          "visual_asset",
          "image_node",
          "workspace_node",
          "step",
          "decision",
          "doc",
          "task",
          "habit",
          "project",
          "focus",
        ])
        .optional(),
      sourceId: z.string().min(1).optional(),
      targetType: z
        .enum([
          "visual_asset",
          "image_node",
          "workspace_node",
          "step",
          "decision",
          "doc",
          "task",
          "habit",
          "project",
          "focus",
        ])
        .optional(),
      targetId: z.string().min(1).optional(),
      sourceVersionId: z.string().nullable().optional(),
      targetVersionId: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      expectedUpdatedAt: z.string().optional(),
      requestId: z.string().min(1).optional(),
      request_id: z.string().min(1).optional(),
    },
    async (args) => {
      try {
        await ensureAuthenticated();
        const requestId = requestIdFromInput(args);
        const outcome = await replayVisualSafe(
          visualReplayCache,
          visualInFlightRequests,
          "update_visual_relation",
          requestId,
          args,
          async () => {
            const service = getVisualService();
            const existing = (
              await service.listRelations(args.workspaceId)
            ).find((relation) => relation.id === args.relationId);
            if (!existing) {
              throw new VisualServiceError(
                "target_not_found",
                `Visual relation "${args.relationId}" was not found.`,
                { relationId: args.relationId },
              );
            }
            const relation = await service.updateRelation({
              workspaceId: args.workspaceId,
              relationId: args.relationId,
              relationType: (args.relationType ??
                existing.relation_type) as VisualRelationType,
              sourceType: (args.sourceType ??
                existing.source_type) as VisualEndpointType,
              sourceId: args.sourceId ?? existing.source_id,
              targetType: (args.targetType ??
                existing.target_type) as VisualEndpointType,
              targetId: args.targetId ?? existing.target_id,
              sourceVersionId:
                args.sourceVersionId === undefined
                  ? existing.source_version_id
                  : args.sourceVersionId,
              targetVersionId:
                args.targetVersionId === undefined
                  ? existing.target_version_id
                  : args.targetVersionId,
              description:
                args.description === undefined
                  ? existing.description
                  : args.description,
              expectedUpdatedAt: args.expectedUpdatedAt,
            });
            return visualSuccess(
              { operation: "update_visual_relation", relation },
              requestId,
            );
          },
        );
        return operationResult(outcome.payload);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "delete_visual_relation",
    "Delete one typed Visual relation after Workspace authorization. Endpoints and existing visual-only Connections remain unchanged.",
    {
      workspaceId: z.string().min(1),
      relationId: z.string().min(1),
      confirmed: z.boolean().optional(),
      requestId: z.string().min(1).optional(),
      request_id: z.string().min(1).optional(),
    },
    async (args) => {
      try {
        await ensureAuthenticated();
        const requestId = requestIdFromInput(args);
        const outcome = await replayVisualSafe(
          visualReplayCache,
          visualInFlightRequests,
          "delete_visual_relation",
          requestId,
          args,
          async () => {
            await getVisualService().removeRelation(
              args.workspaceId,
              args.relationId,
            );
            return visualSuccess(
              {
                operation: "delete_visual_relation",
                workspaceId: args.workspaceId,
                relationId: args.relationId,
              },
              requestId,
            );
          },
        );
        return operationResult(outcome.payload);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "delete_visual_asset",
    "Soft-delete one Visual asset after explicit confirmation. Image nodes and native workflow objects are not deleted; they become an explainable missing/orphan reference until the asset is restored or removed from the workspace.",
    {
      assetId: z.string().min(1),
      confirmed: z.boolean(),
      expectedVersionId: z.string().optional(),
      requestId: z.string().min(1).optional(),
      request_id: z.string().min(1).optional(),
    },
    async (args) => {
      try {
        await ensureAuthenticated();
        const requestId = requestIdFromInput(args);
        const outcome = await replayVisualSafe(
          visualReplayCache,
          visualInFlightRequests,
          "delete_visual_asset",
          requestId,
          args,
          async () =>
            visualSuccess(
              {
                operation: "delete_visual_asset",
                asset: await getVisualService().deleteAsset(
                  args.assetId,
                  args.confirmed,
                  args.expectedVersionId,
                ),
              },
              requestId,
            ),
        );
        return operationResult(outcome.payload);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "restore_visual_asset",
    "Restore a previously soft-deleted Visual asset by stable asset ID. Its immutable versions and existing image-node references remain intact.",
    {
      assetId: z.string().min(1),
      requestId: z.string().min(1).optional(),
      request_id: z.string().min(1).optional(),
    },
    async (args) => {
      try {
        await ensureAuthenticated();
        const requestId = requestIdFromInput(args);
        const outcome = await replayVisualSafe(
          visualReplayCache,
          visualInFlightRequests,
          "restore_visual_asset",
          requestId,
          args,
          async () =>
            visualSuccess(
              {
                operation: "restore_visual_asset",
                asset: await getVisualService().restoreAsset(args.assetId),
              },
              requestId,
            ),
        );
        return operationResult(outcome.payload);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "draft_visual_to_flow",
    "Create a pending, inspectable conversion draft from an explicitly targeted image asset/node to native Step and Decision candidates plus flow edges. This tool never changes the canvas, native workflow, or source image.",
    {
      workspaceId: z.string().min(1),
      target: z
        .object({
          workspaceId: z.string().min(1).optional(),
          nodeId: z.string().min(1).optional(),
          assetId: z.string().min(1).optional(),
          resourceId: z.string().min(1).optional(),
          title: z.string().min(1).optional(),
        })
        .optional(),
      nodeId: z.string().min(1).optional(),
      assetId: z.string().min(1).optional(),
      resourceId: z.string().min(1).optional(),
      title: z.string().min(1).optional(),
      nodes: z.array(z.any()).optional(),
      edges: z.array(z.any()).optional(),
      draft: z
        .object({
          nodes: z.array(z.any()),
          edges: z.array(z.any()).optional(),
          confidence: z.number().nullable().optional(),
          uncertainties: z.array(z.string()).optional(),
          provenance: z.record(z.string(), z.unknown()).nullable().optional(),
        })
        .optional(),
      confidence: z.number().nullable().optional(),
      uncertainties: z.array(z.string()).optional(),
      provenance: z.record(z.string(), z.unknown()).nullable().optional(),
      requestId: z.string().min(1).optional(),
      request_id: z.string().min(1).optional(),
    },
    async (args) => {
      try {
        await ensureAuthenticated();
        const requestId = requestIdFromInput(args);
        const target = targetFromInput(args);
        const draftInput = (args.draft ?? {}) as {
          nodes?: unknown[];
          edges?: unknown[];
          confidence?: number | null;
          uncertainties?: string[];
          provenance?: Record<string, unknown> | null;
        };
        const nodes = args.nodes ?? draftInput.nodes ?? [];
        const edges = args.edges ?? draftInput.edges ?? [];
        const outcome = await replayVisualSafe(
          visualReplayCache,
          visualInFlightRequests,
          "draft_visual_to_flow",
          requestId,
          { workspaceId: args.workspaceId, target, nodes, edges, args },
          async () => {
            const draft = await getVisualService().createFlowDraft({
              workspaceId: args.workspaceId,
              target: {
                ...target,
                workspaceId: args.workspaceId,
              },
              nodes: nodes as VisualFlowDraft["nodes"],
              edges: edges as VisualFlowDraft["edges"],
              confidence: args.confidence ?? draftInput.confidence ?? null,
              uncertainties:
                args.uncertainties ?? draftInput.uncertainties ?? [],
              provenance: args.provenance ?? draftInput.provenance ?? null,
              requestId,
            });
            return visualSuccess(
              {
                operation: "draft_visual_to_flow",
                draft,
                writesPerformed: false,
              },
              requestId,
            );
          },
        );
        return operationResult(outcome.payload);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "get_visual_flow_draft",
    "Read one visual-to-flow draft by stable draft ID, including source asset version, candidate native nodes, edges, confidence, provenance, and uncertainties; this is read-only.",
    {
      draftId: z.string().min(1),
      requestId: z.string().min(1).optional(),
      request_id: z.string().min(1).optional(),
    },
    async ({ draftId, requestId, request_id }) => {
      try {
        await ensureAuthenticated();
        const draft = await getVisualService().getDraft(draftId);
        return operationResult(
          visualSuccess(
            { operation: "get_visual_flow_draft", draft },
            requestId ?? request_id,
          ).payload,
        );
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "confirm_visual_flow",
    "Commit a pending visual-to-flow draft only after the user confirms the specific proposed Step, Decision, and Connection changes. Repeating the same confirmed request is idempotent; a changed source version is rejected as stale.",
    {
      draftId: z.string().min(1),
      confirmed: z.boolean(),
      requestId: z.string().min(1).optional(),
      request_id: z.string().min(1).optional(),
    },
    async (args) => {
      try {
        await ensureAuthenticated();
        const requestId = requestIdFromInput(args);
        const outcome = await replayVisualSafe(
          visualReplayCache,
          visualInFlightRequests,
          "confirm_visual_flow",
          requestId,
          args,
          async () => {
            const result = await getVisualService().confirmFlowDraft(
              args.draftId,
              args.confirmed,
            );
            return visualSuccess(
              {
                operation: "confirm_visual_flow",
                draft: result.draft,
                result: result.result ?? null,
                writesPerformed: Boolean(result.result),
              },
              requestId,
            );
          },
        );
        return operationResult(outcome.payload);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "reject_visual_flow",
    "Reject or cancel a pending visual-to-flow draft without changing the source image, existing nodes, or native workflow.",
    {
      draftId: z.string().min(1),
      requestId: z.string().min(1).optional(),
      request_id: z.string().min(1).optional(),
    },
    async (args) => {
      try {
        await ensureAuthenticated();
        const requestId = requestIdFromInput(args);
        const outcome = await replayVisualSafe(
          visualReplayCache,
          visualInFlightRequests,
          "reject_visual_flow",
          requestId,
          args,
          async () =>
            visualSuccess(
              {
                operation: "reject_visual_flow",
                draft: await getVisualService().rejectFlowDraft(args.draftId),
                writesPerformed: false,
              },
              requestId,
            ),
        );
        return operationResult(outcome.payload);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  const sqliteDb = options.db || getDatabase(options.dbPath);
  const taskRepo = new TaskRepository(sqliteDb);
  const workspaceRepo = new WorkspaceRepository(sqliteDb);

  server.tool(
    "query_tasks",
    "Query tasks directly from the local SQLite database with optional status, priority, and project filtering.",
    {
      status: z
        .enum(["all", "completed", "pending"])
        .optional()
        .describe("Filter by completion status (all, completed, or pending)."),
      priority: z
        .number()
        .int()
        .min(1)
        .max(4)
        .optional()
        .describe("Filter by priority from 1 (highest) to 4 (lowest)."),
      projectId: z.string().optional().describe("Filter by project ID."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum number of tasks to return (default 50)."),
    },
    async ({ status, priority, projectId, limit = 50 }) => {
      try {
        let query = "SELECT * FROM tasks WHERE 1=1";
        const params: unknown[] = [];
        if (status === "completed") {
          query += " AND is_completed = 1";
        } else if (status === "pending") {
          query += " AND is_completed = 0";
        }
        if (priority !== undefined) {
          query += " AND priority = ?";
          params.push(priority);
        }
        if (projectId) {
          query += " AND project_id = ?";
          params.push(projectId);
        }
        query += " ORDER BY day_order ASC, created_at DESC LIMIT ?";
        params.push(limit);

        const rows = sqliteDb.prepare(query).all(...params);
        return operationResult({ tasks: rows, count: rows.length });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "create_task",
    "Create a new task directly in the local SQLite database.",
    {
      content: z.string().min(1).describe("Task title / content."),
      description: z
        .string()
        .optional()
        .describe("Detailed description or notes."),
      priority: z
        .number()
        .int()
        .min(1)
        .max(4)
        .optional()
        .describe("Priority from 1 to 4."),
      due_date: z.string().optional().describe("Due date in ISO format."),
      project_id: z
        .string()
        .optional()
        .describe("Project ID to associate with."),
      is_evening: z
        .boolean()
        .optional()
        .describe("Whether scheduled for evening."),
    },
    async (input) => {
      try {
        const created = taskRepo.create({
          ...input,
          priority: (input.priority as 1 | 2 | 3 | 4) || undefined,
        });
        return operationResult({ task: created });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "inspect_workspace",
    "Inspect a visual workspace canvas including all containing nodes and connection edges directly from SQLite.",
    {
      workspaceId: z.string().min(1).describe("Workspace ID to inspect."),
    },
    async ({ workspaceId }) => {
      try {
        const data = workspaceRepo.getWorkspace(workspaceId);
        if (!data) {
          throw new Error(`Workspace "${workspaceId}" was not found.`);
        }
        return operationResult(data as unknown as Record<string, unknown>);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "execute_sql",
    "Execute a read-only SELECT query against the local SQLite database for arbitrary analysis.",
    {
      sql: z
        .string()
        .min(1)
        .describe("Read-only SQL query (SELECT, WITH, EXPLAIN, PRAGMA)."),
    },
    async ({ sql }) => {
      try {
        const trimmed = sql.trim();
        const upper = trimmed.toUpperCase();
        const isReadOnly =
          (upper.startsWith("SELECT") ||
            upper.startsWith("WITH") ||
            upper.startsWith("EXPLAIN") ||
            upper.startsWith("PRAGMA")) &&
          !/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|DETACH|VACUUM)\b/i.test(
            trimmed,
          );

        if (!isReadOnly) {
          throw new Error(
            "Only read-only SQL queries (SELECT, WITH, EXPLAIN, PRAGMA) are allowed.",
          );
        }

        const rows = sqliteDb.prepare(trimmed).all();
        return operationResult({ rows, rowCount: rows.length });
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
        "Use this compact workflow reference with the Workspace and Visual MCP tools.",
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
