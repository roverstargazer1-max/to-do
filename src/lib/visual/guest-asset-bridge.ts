import type {
  Workspace,
  WorkspaceEdge,
  WorkspaceNode,
} from "@/lib/types/workspace";
import { QueryClient } from "@tanstack/react-query";
import type { BlueprintCommandAdapters } from "@/lib/workspace/blueprint/commands";
import type {
  VisualAnnotation,
  VisualAsset,
  VisualAssetVersion,
  VisualDerivedInfo,
  VisualFlowDraft,
  VisualInspection,
  VisualRelation,
  VisualTarget,
} from "@/lib/types/visual";
import type {
  CreateVisualAnnotationInput,
  CreateVisualAssetInput,
  CreateVisualRelationInput,
  InspectVisualOptions,
  ReplaceVisualAssetInput,
  VisualMetadataPatch,
} from "@/lib/visual/service";
import type {
  VisualAssetRecordInput,
  VisualAssetStore,
  VisualStoreState,
  VisualVersionRecordInput,
} from "@/lib/visual/store";

export type GuestAssetBridgeOperation =
  | "visual.listAssets"
  | "visual.getAsset"
  | "visual.getAssetIncludingDeleted"
  | "visual.getVersion"
  | "visual.readVersion"
  | "visual.createAsset"
  | "visual.appendVersion"
  | "visual.updateAsset"
  | "visual.removeAsset"
  | "visual.listAnnotations"
  | "visual.putAnnotation"
  | "visual.removeAnnotation"
  | "visual.listDerived"
  | "visual.putDerived"
  | "visual.listRelations"
  | "visual.putRelation"
  | "visual.removeRelation"
  | "visual.listDrafts"
  | "visual.getDraft"
  | "visual.putDraft"
  | "visual.clearAll"
  | "visual.exportState"
  | "visual.importState"
  | "workspace.command"
  | "workspace.get"
  | "workspace.listNodes"
  | "workspace.listEdges"
  | "workspace.listWorkspaces";

export interface GuestAssetBridgeGrant {
  token: string;
  origin: string;
  workspaceIds: string[];
  assetIds?: string[];
  operations: GuestAssetBridgeOperation[];
  issuedAt: number;
  expiresAt: number;
}

export interface GuestAssetBridgeRequest {
  token: string;
  origin: string;
  operation: GuestAssetBridgeOperation;
  workspaceId?: string;
  assetId?: string;
  requestId: string;
  payload?: unknown;
}

export class GuestAssetBridgeError extends Error {
  readonly code = "bridge_unavailable" as const;
  readonly reason:
    | "not_paired"
    | "expired"
    | "revoked"
    | "origin_mismatch"
    | "workspace_not_allowed"
    | "asset_not_allowed"
    | "operation_not_allowed"
    | "invalid_request"
    | "timeout";
  readonly details: Record<string, unknown>;

  constructor(
    reason: GuestAssetBridgeError["reason"],
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "GuestAssetBridgeError";
    this.reason = reason;
    this.details = details;
  }
}

export interface GuestAssetBridgePairInput {
  origin: string;
  workspaceIds: string[];
  assetIds?: string[];
  operations?: GuestAssetBridgeOperation[];
  ttlMs?: number;
}

export interface GuestAssetBridgeManagerOptions {
  now?: () => number;
  tokenFactory?: () => string;
  maxTtlMs?: number;
  maxRequestBytes?: number;
}

export interface GuestAssetBridgeOperationHandler {
  handle(
    request: GuestAssetBridgeRequest,
    context?: { grant: GuestAssetBridgeGrant },
  ): Promise<unknown> | unknown;
}

export interface GuestAssetBridgeHandlerOptions {
  /** Optional browser-side Domain Command adapter for scoped MCP writes. */
  commandAdapters?: BlueprintCommandAdapters;
}

export interface GuestAssetBridgeTransport {
  request<T>(request: GuestAssetBridgeRequest): Promise<T>;
  close?(): void;
}

const DEFAULT_OPERATIONS: GuestAssetBridgeOperation[] = [
  "visual.listAssets",
  "visual.getAsset",
  "visual.getAssetIncludingDeleted",
  "visual.getVersion",
  "visual.readVersion",
  "visual.createAsset",
  "visual.appendVersion",
  "visual.updateAsset",
  "visual.removeAsset",
  "visual.listAnnotations",
  "visual.putAnnotation",
  "visual.removeAnnotation",
  "visual.listDerived",
  "visual.putDerived",
  "visual.listRelations",
  "visual.putRelation",
  "visual.removeRelation",
  "visual.listDrafts",
  "visual.getDraft",
  "visual.putDraft",
  "workspace.command",
  "workspace.get",
  "workspace.listNodes",
  "workspace.listEdges",
  "workspace.listWorkspaces",
];

const UNSCOPED_OPERATIONS = new Set<GuestAssetBridgeOperation>([
  "visual.clearAll",
  "visual.exportState",
  "visual.importState",
]);

function defaultToken(): string {
  return `guest-bridge-${crypto.randomUUID()}`;
}

function byteLength(value: unknown): number {
  if (value instanceof Uint8Array) return value.byteLength;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (typeof Blob !== "undefined" && value instanceof Blob) return value.size;
  if (typeof value === "string") return value.length;
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).reduce<number>(
      (total, item) => total + byteLength(item),
      0,
    );
  }
  if (Array.isArray(value))
    return value.reduce((total, item) => total + byteLength(item), 0);
  return 0;
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function copyGrant(grant: GuestAssetBridgeGrant): GuestAssetBridgeGrant {
  return {
    ...grant,
    workspaceIds: [...grant.workspaceIds],
    assetIds: grant.assetIds && [...grant.assetIds],
    operations: [...grant.operations],
  };
}

/**
 * Server-side half of the Guest bridge. It issues scoped, short-lived grants
 * and validates every message before a browser-side handler sees it. The
 * manager never opens a port or reads a local file by itself.
 */
export class GuestAssetBridgeManager {
  private readonly now: () => number;
  private readonly tokenFactory: () => string;
  private readonly maxTtlMs: number;
  private readonly maxRequestBytes: number;
  private readonly grants = new Map<
    string,
    { grant: GuestAssetBridgeGrant; revoked: boolean; disconnected: boolean }
  >();
  private readonly events: Array<{
    operation: GuestAssetBridgeOperation;
    requestId: string;
    outcome: "allowed" | "rejected";
    at: number;
    reason?: string;
  }> = [];

  constructor(options: GuestAssetBridgeManagerOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.tokenFactory = options.tokenFactory ?? defaultToken;
    this.maxTtlMs = options.maxTtlMs ?? 5 * 60 * 1000;
    this.maxRequestBytes = options.maxRequestBytes ?? 12 * 1024 * 1024;
  }

  pair(input: GuestAssetBridgePairInput): GuestAssetBridgeGrant {
    const origin = input.origin.trim();
    const workspaceIds = uniqueNonEmpty(input.workspaceIds);
    if (!origin || workspaceIds.length === 0) {
      throw new GuestAssetBridgeError(
        "invalid_request",
        "Guest asset bridge pairing requires an origin and at least one Workspace.",
      );
    }
    const ttlMs = Math.max(
      1,
      Math.min(input.ttlMs ?? this.maxTtlMs, this.maxTtlMs),
    );
    const issuedAt = this.now();
    const grant: GuestAssetBridgeGrant = {
      token: this.tokenFactory(),
      origin,
      workspaceIds,
      ...(input.assetIds ? { assetIds: uniqueNonEmpty(input.assetIds) } : {}),
      operations: [...new Set(input.operations ?? DEFAULT_OPERATIONS)],
      issuedAt,
      expiresAt: issuedAt + ttlMs,
    };
    this.grants.set(grant.token, {
      grant,
      revoked: false,
      disconnected: false,
    });
    return {
      ...grant,
      workspaceIds: [...grant.workspaceIds],
      assetIds: grant.assetIds && [...grant.assetIds],
      operations: [...grant.operations],
    };
  }

  revoke(token: string): void {
    const state = this.grants.get(token);
    if (state) state.revoked = true;
  }

  disconnect(token: string): void {
    const state = this.grants.get(token);
    if (state) state.disconnected = true;
  }

  forget(token: string): void {
    this.grants.delete(token);
  }

  getGrant(token: string): GuestAssetBridgeGrant | null {
    const state = this.grants.get(token);
    if (!state) return null;
    return copyGrant(state.grant);
  }

  listEvents(): ReadonlyArray<GuestAssetBridgeManager["events"][number]> {
    return this.events.map((event) => ({ ...event }));
  }

  authorize(request: GuestAssetBridgeRequest): GuestAssetBridgeGrant {
    if (
      !request.token ||
      !request.origin ||
      !request.requestId ||
      !request.operation
    ) {
      throw new GuestAssetBridgeError(
        "invalid_request",
        "Guest asset bridge requests require token, origin, operation, and requestId.",
      );
    }
    const state = this.grants.get(request.token);
    if (!state) {
      throw new GuestAssetBridgeError(
        "not_paired",
        "Guest asset bridge is not paired; open Kagelin and pair this MCP process.",
      );
    }
    const now = this.now();
    if (state.revoked || state.disconnected) {
      throw new GuestAssetBridgeError(
        "revoked",
        "The Guest asset bridge is revoked or disconnected; pair Kagelin again.",
      );
    }
    if (now >= state.grant.expiresAt) {
      state.revoked = true;
      throw new GuestAssetBridgeError(
        "expired",
        "The Guest asset bridge credential expired; pair Kagelin again.",
        { expiresAt: state.grant.expiresAt },
      );
    }
    if (request.origin !== state.grant.origin) {
      throw new GuestAssetBridgeError(
        "origin_mismatch",
        "The Guest asset bridge origin does not match the paired browser page.",
        { expectedOrigin: state.grant.origin },
      );
    }
    if (!state.grant.operations.includes(request.operation)) {
      throw new GuestAssetBridgeError(
        "operation_not_allowed",
        `Guest asset bridge operation "${request.operation}" is not authorized.`,
      );
    }
    if (UNSCOPED_OPERATIONS.has(request.operation)) {
      throw new GuestAssetBridgeError(
        "operation_not_allowed",
        `Guest asset bridge operation "${request.operation}" is intentionally unavailable; use Kagelin's local Backup flow for account-wide state.`,
      );
    }
    if (
      request.workspaceId &&
      !state.grant.workspaceIds.includes(request.workspaceId)
    ) {
      throw new GuestAssetBridgeError(
        "workspace_not_allowed",
        `Workspace "${request.workspaceId}" is outside the Guest bridge grant.`,
        { workspaceId: request.workspaceId },
      );
    }
    if (
      request.assetId &&
      state.grant.assetIds &&
      !state.grant.assetIds.includes(request.assetId)
    ) {
      throw new GuestAssetBridgeError(
        "asset_not_allowed",
        `Visual asset "${request.assetId}" is outside the Guest bridge grant.`,
        { assetId: request.assetId },
      );
    }
    if (byteLength(request.payload) > this.maxRequestBytes) {
      throw new GuestAssetBridgeError(
        "invalid_request",
        "Guest asset bridge request exceeds its byte budget.",
        { maxRequestBytes: this.maxRequestBytes },
      );
    }
    return state.grant;
  }

  /** Authorize a browser poll/response channel without inventing an operation. */
  authorizeSession(token: string, origin: string): GuestAssetBridgeGrant {
    const state = this.grants.get(token);
    if (!state) {
      throw new GuestAssetBridgeError(
        "not_paired",
        "Guest asset bridge is not paired; open Kagelin and pair this MCP process.",
      );
    }
    if (state.revoked || state.disconnected) {
      throw new GuestAssetBridgeError(
        "revoked",
        "The Guest asset bridge is revoked or disconnected; pair Kagelin again.",
      );
    }
    if (this.now() >= state.grant.expiresAt) {
      state.revoked = true;
      throw new GuestAssetBridgeError(
        "expired",
        "The Guest asset bridge credential expired; pair Kagelin again.",
        { expiresAt: state.grant.expiresAt },
      );
    }
    if (origin !== state.grant.origin) {
      throw new GuestAssetBridgeError(
        "origin_mismatch",
        "The Guest asset bridge origin does not match the paired browser page.",
        { expectedOrigin: state.grant.origin },
      );
    }
    return state.grant;
  }

  async dispatch(
    request: GuestAssetBridgeRequest,
    handler: GuestAssetBridgeOperationHandler,
  ): Promise<unknown> {
    try {
      const grant = this.authorize(request);
      const result = await handler.handle(request, { grant });
      this.events.push({
        operation: request.operation,
        requestId: request.requestId,
        outcome: "allowed",
        at: this.now(),
      });
      return result;
    } catch (error) {
      this.events.push({
        operation: request.operation,
        requestId: request.requestId,
        outcome: "rejected",
        at: this.now(),
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  createTransport(
    grant: GuestAssetBridgeGrant,
    handler: GuestAssetBridgeOperationHandler,
  ): GuestAssetBridgeTransport {
    let closed = false;
    return {
      request: async <T>(request: GuestAssetBridgeRequest): Promise<T> => {
        if (closed) {
          throw new GuestAssetBridgeError(
            "revoked",
            "The Guest asset bridge client is closed; pair Kagelin again.",
          );
        }
        return (await this.dispatch(
          { ...request, token: grant.token, origin: grant.origin },
          handler,
        )) as T;
      },
      close: () => {
        closed = true;
        this.disconnect(grant.token);
      },
    };
  }
}

/** Thin client used by a local MCP process or browser-side integration. */
export class GuestAssetBridgeClient {
  constructor(
    private readonly transport: GuestAssetBridgeTransport,
    private readonly grant: GuestAssetBridgeGrant,
  ) {}

  request<T>(
    operation: GuestAssetBridgeOperation,
    input: Omit<GuestAssetBridgeRequest, "token" | "origin" | "operation">,
  ): Promise<T> {
    return this.transport.request<T>({
      ...input,
      operation,
      token: this.grant.token,
      origin: this.grant.origin,
    });
  }

  close(): void {
    this.transport.close?.();
  }
}

export interface GuestAssetBridgeConnection {
  client: GuestAssetBridgeClient;
  getWorkspace: (
    workspaceId: string,
  ) => Promise<Workspace | null> | Workspace | null;
  listNodes: (
    workspaceId: string,
  ) => Promise<WorkspaceNode[]> | WorkspaceNode[];
  listEdges?: (
    workspaceId: string,
  ) => Promise<WorkspaceEdge[]> | WorkspaceEdge[];
  listWorkspaces?: () => Promise<Workspace[]> | Workspace[];
  /** Browser-side Domain Command adapter; MCP never writes Guest rows directly. */
  commandAdapters?: BlueprintCommandAdapters;
}

function cloneBytes(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value.slice();
  const view = value as ArrayBufferView & { BYTES_PER_ELEMENT?: number };
  if (ArrayBuffer.isView(value) && view.BYTES_PER_ELEMENT === 1) {
    return new Uint8Array(
      value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
    );
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (
    Array.isArray(value) &&
    value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)
  ) {
    return Uint8Array.from(value as number[]);
  }
  return undefined;
}

function bytesFrom(value: unknown): Uint8Array {
  const bytes = cloneBytes(value);
  if (!bytes)
    throw new GuestAssetBridgeError(
      "invalid_request",
      "Bridge response did not contain bytes.",
    );
  return bytes;
}

const BRIDGE_BYTES_KEY = "__kagelinBytes";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)),
    );
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) {
    throw new GuestAssetBridgeError(
      "invalid_request",
      "Bridge response contained invalid byte encoding.",
    );
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** JSON-safe recursive encoding shared by the browser and local MCP host. */
export function encodeGuestAssetBridgeValue(value: unknown): unknown {
  const bytes = cloneBytes(value);
  if (
    bytes &&
    (value instanceof Uint8Array ||
      (ArrayBuffer.isView(value) &&
        (value as ArrayBufferView & { BYTES_PER_ELEMENT?: number })
          .BYTES_PER_ELEMENT === 1) ||
      value instanceof ArrayBuffer)
  ) {
    return { [BRIDGE_BYTES_KEY]: bytesToBase64(bytes) };
  }
  if (Array.isArray(value))
    return value.map((item) => encodeGuestAssetBridgeValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        encodeGuestAssetBridgeValue(item),
      ]),
    );
  }
  return value;
}

/** Decode values received from the browser without trusting their shape. */
export function decodeGuestAssetBridgeValue(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map((item) => decodeGuestAssetBridgeValue(item));
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).length === 1 &&
      typeof record[BRIDGE_BYTES_KEY] === "string"
    ) {
      return base64ToBytes(record[BRIDGE_BYTES_KEY] as string);
    }
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [
        key,
        decodeGuestAssetBridgeValue(item),
      ]),
    );
  }
  return value;
}

export interface GuestAssetBridgeErrorPayload {
  code?: unknown;
  reason?: unknown;
  message?: unknown;
  details?: unknown;
}

const BRIDGE_ERROR_REASONS: GuestAssetBridgeError["reason"][] = [
  "not_paired",
  "expired",
  "revoked",
  "origin_mismatch",
  "workspace_not_allowed",
  "asset_not_allowed",
  "operation_not_allowed",
  "invalid_request",
  "timeout",
];

export function guestAssetBridgeErrorFromPayload(
  payload: GuestAssetBridgeErrorPayload,
): GuestAssetBridgeError {
  const reason = BRIDGE_ERROR_REASONS.includes(
    payload.reason as GuestAssetBridgeError["reason"],
  )
    ? (payload.reason as GuestAssetBridgeError["reason"])
    : "invalid_request";
  return new GuestAssetBridgeError(
    reason,
    typeof payload.message === "string"
      ? payload.message
      : "The Guest asset bridge rejected the request.",
    payload.details && typeof payload.details === "object"
      ? (payload.details as Record<string, unknown>)
      : {},
  );
}

function bridgeRequestId(): string {
  return crypto.randomUUID();
}

/** Build a connection whose workspace reads also cross the scoped bridge. */
export function createGuestAssetBridgeConnection(
  client: GuestAssetBridgeClient,
  options: {
    commandAdapters?: BlueprintCommandAdapters;
  } = {},
): GuestAssetBridgeConnection {
  return {
    client,
    getWorkspace: (workspaceId) =>
      client.request("workspace.get", {
        requestId: bridgeRequestId(),
        workspaceId,
        payload: { workspaceId },
      }),
    listNodes: (workspaceId) =>
      client.request("workspace.listNodes", {
        requestId: bridgeRequestId(),
        workspaceId,
        payload: { workspaceId },
      }),
    listEdges: (workspaceId) =>
      client.request("workspace.listEdges", {
        requestId: bridgeRequestId(),
        workspaceId,
        payload: { workspaceId },
      }),
    listWorkspaces: () =>
      client.request("workspace.listWorkspaces", {
        requestId: bridgeRequestId(),
        payload: {},
      }),
    ...(options.commandAdapters
      ? { commandAdapters: options.commandAdapters }
      : {}),
  };
}

function commandWorkspaceId(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const record = input as Record<string, unknown>;
  const value = record.workspaceId ?? record.workspace_id;
  return typeof value === "string" && value.trim() ? value : undefined;
}

function remoteGuestCommand<T>(
  client: GuestAssetBridgeClient,
  command: string,
  input: unknown,
): Promise<T> {
  return client.request<T>("workspace.command", {
    requestId: crypto.randomUUID(),
    workspaceId: commandWorkspaceId(input),
    payload: { command, input },
  });
}

/** Command adapter proxy used by the local MCP host for browser-side writes. */
export function createGuestBridgeCommandAdapters(
  client: GuestAssetBridgeClient,
): BlueprintCommandAdapters {
  return {
    workspace: {
      create: (_ctx, input) =>
        remoteGuestCommand(client, "workspace.create", input),
      delete: async (_ctx, id) => {
        await remoteGuestCommand(client, "workspace.delete", { id });
      },
    },
    node: {
      add: (_ctx, input) => remoteGuestCommand(client, "node.add", input),
      resize: async (_ctx, input) => {
        await remoteGuestCommand(client, "node.resize", input);
      },
      updateDocNode: async (_ctx, input) => {
        await remoteGuestCommand(client, "node.updateDocNode", input);
      },
      updateDecisionNode: async (_ctx, input) => {
        await remoteGuestCommand(client, "node.updateDecisionNode", input);
      },
      updateStepNode: async (_ctx, input) => {
        await remoteGuestCommand(client, "node.updateStepNode", input);
      },
      updateImageNode: async (_ctx, input) => {
        await remoteGuestCommand(client, "node.updateImageNode", input);
      },
      remove: async (_ctx, input) => {
        await remoteGuestCommand(client, "node.remove", input);
      },
    },
    edge: {
      add: (_ctx, input) => remoteGuestCommand(client, "edge.add", input),
      remove: async (_ctx, input) => {
        await remoteGuestCommand(client, "edge.remove", input);
      },
    },
    task: {
      create: (_ctx, input) => remoteGuestCommand(client, "task.create", input),
    },
    project: {
      create: (_ctx, input) =>
        remoteGuestCommand(client, "project.create", input),
    },
    habit: {
      create: (_ctx, input) =>
        remoteGuestCommand(client, "habit.create", input),
    },
  };
}

export interface GuestAssetBridgeBrowserSessionOptions {
  endpoint: string;
  grant: GuestAssetBridgeGrant;
  handler: GuestAssetBridgeOperationHandler;
  fetchImpl?: typeof fetch;
  onError?: (error: unknown) => void;
}

/**
 * Browser-side long-poll session. The page owns the Guest IndexedDB handler;
 * the local MCP host owns the queue and never receives an unpaired callback.
 */
export class GuestAssetBridgeBrowserSession {
  private readonly endpoint: string;
  private readonly grant: GuestAssetBridgeGrant;
  private readonly handler: GuestAssetBridgeOperationHandler;
  private readonly fetchImpl: typeof fetch;
  private readonly onError?: (error: unknown) => void;
  private controller: AbortController | null = null;
  private loopPromise: Promise<void> | null = null;
  private running = false;

  constructor(options: GuestAssetBridgeBrowserSessionOptions) {
    this.endpoint = options.endpoint.replace(/\/$/, "");
    this.grant = options.grant;
    this.handler = options.handler;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.onError = options.onError;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loopPromise = this.run();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.controller?.abort();
    try {
      await this.loopPromise;
    } catch {
      // Abort is the expected path when a browser tab closes or disconnects.
    }
    this.loopPromise = null;
    try {
      await this.fetchImpl(`${this.endpoint}/disconnect`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: this.grant.token }),
      });
    } catch {
      // The host observes the closed poll even if the best-effort notification fails.
    }
  }

  private async run(): Promise<void> {
    while (this.running) {
      try {
        await this.pollOnce();
      } catch (error) {
        if (
          !this.running &&
          error instanceof Error &&
          error.name === "AbortError"
        )
          return;
        this.onError?.(error);
        this.running = false;
        return;
      }
    }
  }

  private async pollOnce(): Promise<void> {
    this.controller = new AbortController();
    try {
      const response = await this.fetchImpl(
        `${this.endpoint}/request?token=${encodeURIComponent(this.grant.token)}`,
        {
          signal: this.controller.signal,
          headers: { accept: "application/json" },
        },
      );
      const raw = await response.json();
      const body = decodeGuestAssetBridgeValue(raw) as Record<string, unknown>;
      if (!response.ok)
        throw guestAssetBridgeErrorFromPayload(
          body as GuestAssetBridgeErrorPayload,
        );
      if (body.kind !== "request") return;
      const request = body.request as GuestAssetBridgeRequest;
      try {
        const value = await this.handler.handle(request, { grant: this.grant });
        await this.respond(request.requestId, { ok: true, value });
      } catch (error) {
        await this.respond(request.requestId, {
          ok: false,
          error: serializeBridgeError(error),
        });
      }
    } finally {
      this.controller = null;
    }
  }

  private async respond(
    requestId: string,
    result: { ok: true; value: unknown } | { ok: false; error: unknown },
  ): Promise<void> {
    const body = encodeGuestAssetBridgeValue({
      token: this.grant.token,
      requestId,
      ...result,
    });
    const response = await this.fetchImpl(`${this.endpoint}/response`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const raw = decodeGuestAssetBridgeValue(
        await response.json(),
      ) as GuestAssetBridgeErrorPayload;
      throw guestAssetBridgeErrorFromPayload(raw);
    }
  }
}

function serializeBridgeError(error: unknown): GuestAssetBridgeErrorPayload {
  if (error instanceof GuestAssetBridgeError) {
    return {
      code: error.code,
      reason: error.reason,
      message: error.message,
      details: error.details,
    };
  }
  return {
    code: "bridge_unavailable",
    reason: "invalid_request",
    message: error instanceof Error ? error.message : String(error),
    details: {},
  };
}

export async function pairGuestAssetBridgeBrowser(
  endpoint: string,
  input: Omit<GuestAssetBridgePairInput, "origin">,
  handler: GuestAssetBridgeOperationHandler,
  options: Omit<
    GuestAssetBridgeBrowserSessionOptions,
    "endpoint" | "grant" | "handler"
  > & {
    autoStart?: boolean;
    pairingCode?: string;
  } = {},
): Promise<{
  grant: GuestAssetBridgeGrant;
  session: GuestAssetBridgeBrowserSession;
}> {
  const normalizedEndpoint = endpoint.replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${normalizedEndpoint}/pair`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ ...input, pairingCode: options.pairingCode }),
  });
  const body = decodeGuestAssetBridgeValue(await response.json()) as Record<
    string,
    unknown
  >;
  if (!response.ok)
    throw guestAssetBridgeErrorFromPayload(
      body as GuestAssetBridgeErrorPayload,
    );
  const grant = body.grant as GuestAssetBridgeGrant | undefined;
  if (!grant?.token || !grant.origin) {
    throw new GuestAssetBridgeError(
      "invalid_request",
      "The local MCP bridge returned an invalid pairing grant.",
    );
  }
  const session = new GuestAssetBridgeBrowserSession({
    ...options,
    endpoint: normalizedEndpoint,
    grant,
    handler,
    fetchImpl,
  });
  if (options.autoStart !== false) session.start();
  return { grant, session };
}

/** VisualAssetStore adapter whose every operation crosses the scoped bridge. */
export class GuestAssetBridgeStore implements VisualAssetStore {
  constructor(private readonly client: GuestAssetBridgeClient) {}

  listAssets(workspaceId?: string): Promise<VisualAsset[]> {
    return this.client.request("visual.listAssets", {
      requestId: crypto.randomUUID(),
      workspaceId,
      payload: { workspaceId },
    });
  }

  getAsset(assetId: string): Promise<VisualAsset | null> {
    return this.client.request("visual.getAsset", {
      requestId: crypto.randomUUID(),
      assetId,
      payload: { assetId },
    });
  }

  getAssetIncludingDeleted(assetId: string): Promise<VisualAsset | null> {
    return this.client.request("visual.getAssetIncludingDeleted", {
      requestId: crypto.randomUUID(),
      assetId,
      payload: { assetId },
    });
  }

  getVersion(
    assetId: string,
    versionId?: string,
  ): Promise<VisualAssetVersion | null> {
    return this.client.request("visual.getVersion", {
      requestId: crypto.randomUUID(),
      assetId,
      payload: { assetId, versionId },
    });
  }

  async readVersion(assetId: string, versionId?: string): Promise<Uint8Array> {
    const result = await this.client.request<unknown>("visual.readVersion", {
      requestId: crypto.randomUUID(),
      assetId,
      payload: { assetId, versionId },
    });
    return bytesFrom(result);
  }

  createAsset(input: VisualAssetRecordInput): Promise<VisualAsset> {
    return this.client.request("visual.createAsset", {
      requestId: crypto.randomUUID(),
      workspaceId: input.asset.workspace_id ?? undefined,
      assetId: input.asset.id,
      payload: input,
    });
  }

  appendVersion(input: VisualVersionRecordInput): Promise<VisualAsset> {
    return this.client.request("visual.appendVersion", {
      requestId: crypto.randomUUID(),
      workspaceId: input.asset.workspace_id ?? undefined,
      assetId: input.asset.id,
      payload: input,
    });
  }

  updateAsset(asset: VisualAsset): Promise<VisualAsset> {
    return this.client.request("visual.updateAsset", {
      requestId: crypto.randomUUID(),
      workspaceId: asset.workspace_id ?? undefined,
      assetId: asset.id,
      payload: asset,
    });
  }

  removeAsset(assetId: string): Promise<void> {
    return this.client.request("visual.removeAsset", {
      requestId: crypto.randomUUID(),
      assetId,
      payload: { assetId },
    });
  }

  listAnnotations(
    assetId: string,
    versionId?: string,
  ): Promise<VisualAnnotation[]> {
    return this.client.request("visual.listAnnotations", {
      requestId: crypto.randomUUID(),
      assetId,
      payload: { assetId, versionId },
    });
  }

  putAnnotation(annotation: VisualAnnotation): Promise<VisualAnnotation> {
    return this.client.request("visual.putAnnotation", {
      requestId: crypto.randomUUID(),
      workspaceId: annotation.workspace_id,
      assetId: annotation.asset_id,
      payload: annotation,
    });
  }

  removeAnnotation(annotationId: string): Promise<void> {
    return this.client.request("visual.removeAnnotation", {
      requestId: crypto.randomUUID(),
      payload: { annotationId },
    });
  }

  listDerived(
    assetId: string,
    versionId?: string,
  ): Promise<VisualDerivedInfo[]> {
    return this.client.request("visual.listDerived", {
      requestId: crypto.randomUUID(),
      assetId,
      payload: { assetId, versionId },
    });
  }

  putDerived(derived: VisualDerivedInfo): Promise<VisualDerivedInfo> {
    return this.client.request("visual.putDerived", {
      requestId: crypto.randomUUID(),
      assetId: derived.asset_id,
      payload: derived,
    });
  }

  listRelations(workspaceId: string): Promise<VisualRelation[]> {
    return this.client.request("visual.listRelations", {
      requestId: crypto.randomUUID(),
      workspaceId,
      payload: { workspaceId },
    });
  }

  putRelation(relation: VisualRelation): Promise<VisualRelation> {
    return this.client.request("visual.putRelation", {
      requestId: crypto.randomUUID(),
      workspaceId: relation.workspace_id,
      assetId:
        relation.source_type === "visual_asset"
          ? relation.source_id
          : relation.target_type === "visual_asset"
            ? relation.target_id
            : undefined,
      payload: relation,
    });
  }

  removeRelation(relationId: string): Promise<void> {
    return this.client.request("visual.removeRelation", {
      requestId: crypto.randomUUID(),
      payload: { relationId },
    });
  }

  listDrafts(workspaceId: string): Promise<VisualFlowDraft[]> {
    return this.client.request("visual.listDrafts", {
      requestId: crypto.randomUUID(),
      workspaceId,
      payload: { workspaceId },
    });
  }

  getDraft(draftId: string): Promise<VisualFlowDraft | null> {
    return this.client.request("visual.getDraft", {
      requestId: crypto.randomUUID(),
      payload: { draftId },
    });
  }

  putDraft(draft: VisualFlowDraft): Promise<VisualFlowDraft> {
    return this.client.request("visual.putDraft", {
      requestId: crypto.randomUUID(),
      workspaceId: draft.workspace_id,
      assetId: draft.source_asset_id,
      payload: draft,
    });
  }

  clearAll(): Promise<void> {
    return this.client.request("visual.clearAll", {
      requestId: crypto.randomUUID(),
      payload: {},
    });
  }

  exportState(): Promise<VisualStoreState> {
    return this.client.request("visual.exportState", {
      requestId: crypto.randomUUID(),
      payload: {},
    });
  }

  importState(state: VisualStoreState): Promise<void> {
    return this.client.request("visual.importState", {
      requestId: crypto.randomUUID(),
      payload: state,
    });
  }
}

/** A bridge handler can expose only the app's already-authorized store. */
export function createGuestAssetBridgeHandler(
  store: VisualAssetStore,
  workspace: {
    get: (workspaceId: string) => Promise<Workspace | null> | Workspace | null;
    listNodes: (
      workspaceId: string,
    ) => Promise<WorkspaceNode[]> | WorkspaceNode[];
    listEdges?: (
      workspaceId: string,
    ) => Promise<WorkspaceEdge[]> | WorkspaceEdge[];
    listWorkspaces?: () => Promise<Workspace[]> | Workspace[];
  },
  options: GuestAssetBridgeHandlerOptions = {},
): GuestAssetBridgeOperationHandler {
  const text = (value: unknown): string =>
    typeof value === "string" ? value : String(value ?? "");

  const requireWorkspace = (
    request: GuestAssetBridgeRequest,
    payload: Record<string, unknown>,
    grant?: GuestAssetBridgeGrant,
  ): string => {
    const workspaceId = request.workspaceId ?? text(payload.workspaceId);
    if (!workspaceId) {
      throw new GuestAssetBridgeError(
        "invalid_request",
        "Guest bridge operations require an explicit Workspace scope.",
      );
    }
    if (grant && !grant.workspaceIds.includes(workspaceId)) {
      throw new GuestAssetBridgeError(
        "workspace_not_allowed",
        `Workspace "${workspaceId}" is outside the Guest bridge grant.`,
        { workspaceId },
      );
    }
    return workspaceId;
  };

  const requireAsset = async (
    assetId: string,
    grant?: GuestAssetBridgeGrant,
  ): Promise<VisualAsset> => {
    if (!assetId) {
      throw new GuestAssetBridgeError(
        "invalid_request",
        "Guest bridge visual operations require an explicit asset ID.",
      );
    }
    if (grant?.assetIds?.includes(assetId)) {
      const grantedAsset = await (store.getAssetIncludingDeleted?.(assetId) ??
        store.getAsset(assetId));
      if (!grantedAsset) {
        throw new GuestAssetBridgeError(
          "asset_not_allowed",
          `Visual asset "${assetId}" was not found in the paired Guest store.`,
          { assetId },
        );
      }
      return grantedAsset;
    }
    const asset = await (store.getAssetIncludingDeleted?.(assetId) ??
      store.getAsset(assetId));
    if (!asset) {
      throw new GuestAssetBridgeError(
        "asset_not_allowed",
        `Visual asset "${assetId}" was not found in the paired Guest store.`,
        { assetId },
      );
    }
    if (grant) {
      if (
        !asset.workspace_id ||
        !grant.workspaceIds.includes(asset.workspace_id)
      ) {
        throw new GuestAssetBridgeError(
          "asset_not_allowed",
          `Visual asset "${assetId}" is not mounted in an authorized Guest Workspace; pair it explicitly by asset ID.`,
          { assetId, workspaceId: asset.workspace_id },
        );
      }
    }
    return asset;
  };

  return {
    async handle(request, context) {
      const payload = (request.payload ?? {}) as Record<string, unknown>;
      const grant = context?.grant;
      switch (request.operation) {
        case "visual.listAssets": {
          const workspaceId = requireWorkspace(request, payload, grant);
          return store.listAssets(workspaceId);
        }
        case "visual.getAsset":
        case "visual.getAssetIncludingDeleted": {
          const asset = await requireAsset(
            request.assetId ?? text(payload.assetId),
            grant,
          );
          return request.operation === "visual.getAsset" &&
            asset.status === "deleted"
            ? null
            : asset;
        }
        case "visual.getVersion":
        case "visual.readVersion": {
          const assetId = request.assetId ?? text(payload.assetId);
          await requireAsset(assetId, grant);
          return request.operation === "visual.getVersion"
            ? store.getVersion(assetId, text(payload.versionId) || undefined)
            : store.readVersion(assetId, text(payload.versionId) || undefined);
        }
        case "visual.createAsset": {
          const input = payload as unknown as VisualAssetRecordInput;
          const workspaceId = requireWorkspace(
            request,
            { workspaceId: input.asset.workspace_id },
            grant,
          );
          if (input.asset.workspace_id !== workspaceId) {
            throw new GuestAssetBridgeError(
              "invalid_request",
              "The Guest bridge asset Workspace scope does not match the request.",
            );
          }
          return store.createAsset(input);
        }
        case "visual.appendVersion": {
          const input = payload as unknown as VisualVersionRecordInput;
          await requireAsset(input.asset.id, grant);
          return store.appendVersion(input);
        }
        case "visual.updateAsset": {
          const asset = payload as unknown as VisualAsset;
          await requireAsset(asset.id, grant);
          return store.updateAsset(asset);
        }
        case "visual.removeAsset":
          await requireAsset(request.assetId ?? text(payload.assetId), grant);
          return store.removeAsset(request.assetId ?? text(payload.assetId));
        case "visual.listAnnotations":
          await requireAsset(request.assetId ?? text(payload.assetId), grant);
          return store.listAnnotations(
            request.assetId ?? text(payload.assetId),
            text(payload.versionId) || undefined,
          );
        case "visual.putAnnotation": {
          const annotation = payload as unknown as VisualAnnotation;
          requireWorkspace(
            request,
            { workspaceId: annotation.workspace_id },
            grant,
          );
          await requireAsset(annotation.asset_id, grant);
          return store.putAnnotation(annotation);
        }
        case "visual.removeAnnotation": {
          const annotationId = text(payload.annotationId);
          for (const workspaceId of grant?.workspaceIds ?? []) {
            const assets = await store.listAssets(workspaceId);
            for (const asset of assets) {
              const annotations = await store.listAnnotations(asset.id);
              if (
                annotations.some((annotation) => annotation.id === annotationId)
              ) {
                return store.removeAnnotation(annotationId);
              }
            }
          }
          throw new GuestAssetBridgeError(
            "asset_not_allowed",
            `Annotation "${annotationId}" is outside the Guest bridge grant.`,
            { annotationId },
          );
        }
        case "visual.listDerived":
          await requireAsset(request.assetId ?? text(payload.assetId), grant);
          return store.listDerived(
            request.assetId ?? text(payload.assetId),
            text(payload.versionId) || undefined,
          );
        case "visual.putDerived": {
          const derived = payload as unknown as VisualDerivedInfo;
          await requireAsset(derived.asset_id, grant);
          return store.putDerived(derived);
        }
        case "visual.listRelations": {
          const workspaceId = requireWorkspace(request, payload, grant);
          return store.listRelations(workspaceId);
        }
        case "visual.putRelation": {
          const relation = payload as unknown as VisualRelation;
          requireWorkspace(
            request,
            { workspaceId: relation.workspace_id },
            grant,
          );
          if (relation.source_type === "visual_asset")
            await requireAsset(relation.source_id, grant);
          if (relation.target_type === "visual_asset")
            await requireAsset(relation.target_id, grant);
          return store.putRelation(relation);
        }
        case "visual.removeRelation": {
          const relationId = text(payload.relationId);
          for (const workspaceId of grant?.workspaceIds ?? []) {
            if (
              (await store.listRelations(workspaceId)).some(
                (relation) => relation.id === relationId,
              )
            ) {
              return store.removeRelation(relationId);
            }
          }
          throw new GuestAssetBridgeError(
            "workspace_not_allowed",
            `Visual relation "${relationId}" is outside the Guest bridge grant.`,
            { relationId },
          );
        }
        case "visual.listDrafts": {
          const workspaceId = requireWorkspace(request, payload, grant);
          return store.listDrafts(workspaceId);
        }
        case "visual.getDraft": {
          const draftId = text(payload.draftId);
          for (const workspaceId of grant?.workspaceIds ?? []) {
            const draft = (await store.listDrafts(workspaceId)).find(
              (item) => item.id === draftId,
            );
            if (draft) return draft;
          }
          throw new GuestAssetBridgeError(
            "workspace_not_allowed",
            `Visual flow draft "${draftId}" is outside the Guest bridge grant.`,
            { draftId },
          );
        }
        case "visual.putDraft": {
          const draft = payload as unknown as VisualFlowDraft;
          requireWorkspace(request, { workspaceId: draft.workspace_id }, grant);
          await requireAsset(draft.source_asset_id, grant);
          return store.putDraft(draft);
        }
        case "workspace.command": {
          const commandAdapters = options.commandAdapters;
          if (!commandAdapters) {
            throw new GuestAssetBridgeError(
              "operation_not_allowed",
              "This Guest bridge has no browser-side Workspace command adapter.",
            );
          }
          const command = text(payload.command);
          const input = payload.input;
          const workspaceId = commandWorkspaceId(input);
          if (!workspaceId) {
            throw new GuestAssetBridgeError(
              "invalid_request",
              "Guest bridge Workspace commands require an explicit Workspace ID.",
            );
          }
          requireWorkspace(request, { workspaceId }, grant);
          const context = {
            queryClient: new QueryClient({
              defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
              },
            }),
            isGuestMode: true,
          };
          switch (command) {
            case "node.add":
              return commandAdapters.node.add(
                context,
                input as Parameters<BlueprintCommandAdapters["node"]["add"]>[1],
              );
            case "node.resize":
              return commandAdapters.node.resize(
                context,
                input as Parameters<
                  BlueprintCommandAdapters["node"]["resize"]
                >[1],
              );
            case "node.updateDocNode":
              return commandAdapters.node.updateDocNode(
                context,
                input as Parameters<
                  BlueprintCommandAdapters["node"]["updateDocNode"]
                >[1],
              );
            case "node.updateDecisionNode":
              return commandAdapters.node.updateDecisionNode(
                context,
                input as Parameters<
                  BlueprintCommandAdapters["node"]["updateDecisionNode"]
                >[1],
              );
            case "node.updateStepNode":
              return commandAdapters.node.updateStepNode(
                context,
                input as Parameters<
                  BlueprintCommandAdapters["node"]["updateStepNode"]
                >[1],
              );
            case "node.updateImageNode":
              if (!commandAdapters.node.updateImageNode)
                throw new GuestAssetBridgeError(
                  "operation_not_allowed",
                  "The browser-side image-node command is unavailable.",
                );
              return commandAdapters.node.updateImageNode(
                context,
                input as Parameters<
                  NonNullable<
                    BlueprintCommandAdapters["node"]["updateImageNode"]
                  >
                >[1],
              );
            case "node.remove":
              return commandAdapters.node.remove(
                context,
                input as Parameters<
                  BlueprintCommandAdapters["node"]["remove"]
                >[1],
              );
            case "edge.add":
              return commandAdapters.edge.add(
                context,
                input as Parameters<BlueprintCommandAdapters["edge"]["add"]>[1],
              );
            case "edge.remove":
              return commandAdapters.edge.remove(
                context,
                input as Parameters<
                  BlueprintCommandAdapters["edge"]["remove"]
                >[1],
              );
            default:
              throw new GuestAssetBridgeError(
                "operation_not_allowed",
                `Guest bridge Workspace command "${command}" is not allowed.`,
              );
          }
        }
        case "visual.clearAll":
        case "visual.exportState":
        case "visual.importState":
          throw new GuestAssetBridgeError(
            "operation_not_allowed",
            `Guest bridge operation "${request.operation}" is unavailable through the scoped asset bridge.`,
          );
        case "workspace.get": {
          const workspaceId = requireWorkspace(request, payload, grant);
          return workspace.get(workspaceId);
        }
        case "workspace.listNodes": {
          const workspaceId = requireWorkspace(request, payload, grant);
          return workspace.listNodes(workspaceId);
        }
        case "workspace.listEdges":
          if (!workspace.listEdges)
            throw new GuestAssetBridgeError(
              "operation_not_allowed",
              "This Guest bridge handler does not expose canvas edges.",
            );
          return workspace.listEdges(requireWorkspace(request, payload, grant));
        case "workspace.listWorkspaces": {
          if (!workspace.listWorkspaces)
            throw new GuestAssetBridgeError(
              "operation_not_allowed",
              "This Guest bridge handler does not expose Workspace listing.",
            );
          const workspaces = await workspace.listWorkspaces();
          if (!grant) return workspaces;
          return workspaces.filter((item) =>
            grant.workspaceIds.includes(item.id),
          );
        }
        default:
          throw new GuestAssetBridgeError(
            "operation_not_allowed",
            `Unsupported Guest bridge operation "${request.operation}".`,
          );
      }
    },
  };
}

// These imports are intentionally referenced in this module's public type
// surface so bridge callers can build typed request payloads without adding a
// second Guest-specific visual domain model.
export type GuestBridgeVisualInputs = {
  create: CreateVisualAssetInput;
  inspect: { target: VisualTarget; options?: InspectVisualOptions };
  replace: ReplaceVisualAssetInput;
  metadata: { assetId: string; patch: VisualMetadataPatch };
  annotation: CreateVisualAnnotationInput;
  relation: CreateVisualRelationInput;
  inspection: VisualInspection;
};
