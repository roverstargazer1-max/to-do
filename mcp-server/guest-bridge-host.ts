import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { URL } from "node:url";
import {
  createGuestAssetBridgeConnection,
  createGuestBridgeCommandAdapters,
  decodeGuestAssetBridgeValue,
  encodeGuestAssetBridgeValue,
  GuestAssetBridgeClient,
  GuestAssetBridgeError,
  guestAssetBridgeErrorFromPayload,
  GuestAssetBridgeManager,
  type GuestAssetBridgeGrant,
  type GuestAssetBridgeRequest,
  type GuestAssetBridgeTransport,
} from "../src/lib/visual/guest-asset-bridge";
import type { GuestAssetBridgeConnection } from "../src/lib/visual/guest-asset-bridge";

const LOOPBACK_HOST = "127.0.0.1" as const;
const DEFAULT_PORT = 37_373;
const DEFAULT_PATH = "/kagelin/guest-asset-bridge";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BODY_BYTES = 16 * 1024 * 1024;

export interface GuestAssetBridgeHttpHostOptions {
  /** The host is intentionally fixed to loopback; public interfaces are not supported. */
  port?: number;
  endpointPath?: string;
  requestTimeoutMs?: number;
  maxBodyBytes?: number;
  pairingCode?: string;
  manager?: GuestAssetBridgeManager;
}

export interface GuestAssetBridgeHttpHostAddress {
  host: typeof LOOPBACK_HOST;
  port: number;
  url: string;
  pairingCode: string;
}

type PendingRequest = {
  token: string;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

type PollWaiter = {
  token: string;
  origin: string;
  response: ServerResponse;
  request: IncomingMessage;
  timer: ReturnType<typeof setTimeout>;
  settled: boolean;
};

function randomPairingCode(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
}

function originFrom(request: IncomingMessage): string {
  const origin = request.headers.origin;
  return Array.isArray(origin) ? (origin[0] ?? "") : (origin ?? "");
}

function assertBrowserOrigin(origin: string): string {
  if (!origin || origin === "null") {
    throw new GuestAssetBridgeError(
      "origin_mismatch",
      "The Guest asset bridge requires a browser Origin header.",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new GuestAssetBridgeError(
      "origin_mismatch",
      "The Guest asset bridge Origin header is invalid.",
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new GuestAssetBridgeError(
      "origin_mismatch",
      "The Guest asset bridge only accepts HTTP(S) browser origins.",
    );
  }
  return parsed.origin;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new GuestAssetBridgeError(
      "invalid_request",
      `Guest asset bridge pairing requires a string array for ${field}.`,
    );
  }
  return value;
}

async function readJson(
  request: IncomingMessage,
  maxBodyBytes: number,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBodyBytes) {
      throw new GuestAssetBridgeError(
        "invalid_request",
        "Guest asset bridge request exceeds its byte budget.",
        { maxRequestBytes: maxBodyBytes },
      );
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new GuestAssetBridgeError(
      "invalid_request",
      "Guest asset bridge request is not valid JSON.",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new GuestAssetBridgeError(
      "invalid_request",
      "Guest asset bridge request must be a JSON object.",
    );
  }
  return parsed as Record<string, unknown>;
}

function responseStatus(error: unknown): number {
  if (!(error instanceof GuestAssetBridgeError)) return 500;
  switch (error.reason) {
    case "invalid_request":
      return 400;
    case "origin_mismatch":
    case "workspace_not_allowed":
    case "asset_not_allowed":
    case "operation_not_allowed":
      return 403;
    case "not_paired":
    case "expired":
    case "revoked":
    case "timeout":
      return 503;
  }
}

function errorBody(error: unknown): Record<string, unknown> {
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

function writeJson(
  response: ServerResponse,
  status: number,
  value: unknown,
  origin?: string,
): void {
  if (origin) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader("vary", "Origin");
  }
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.statusCode = status;
  response.end(JSON.stringify(encodeGuestAssetBridgeValue(value)));
}

/**
 * Loopback host for the browser-side Guest bridge. It uses HTTP long polling
 * instead of a WebSocket dependency so the MCP process remains stdio-first;
 * the browser is still the only component that owns IndexedDB and executes
 * Domain Commands.
 */
export class GuestAssetBridgeHttpHost {
  readonly manager: GuestAssetBridgeManager;
  readonly pairingCode: string;
  readonly connection: GuestAssetBridgeConnection;

  private readonly port: number;
  private readonly endpointPath: string;
  private readonly requestTimeoutMs: number;
  private readonly maxBodyBytes: number;
  private readonly queues = new Map<string, GuestAssetBridgeRequest[]>();
  private readonly pending = new Map<string, PendingRequest>();
  private pollWaiter: PollWaiter | null = null;
  private activeGrant: GuestAssetBridgeGrant | null = null;
  private server: Server | null = null;
  private address: GuestAssetBridgeHttpHostAddress | null = null;

  constructor(options: GuestAssetBridgeHttpHostOptions = {}) {
    this.port = options.port ?? DEFAULT_PORT;
    this.endpointPath = normalizePath(options.endpointPath ?? DEFAULT_PATH);
    this.requestTimeoutMs = Math.max(
      1_000,
      Math.min(options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS, 120_000),
    );
    this.maxBodyBytes = Math.max(
      64 * 1024,
      Math.min(
        options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
        32 * 1024 * 1024,
      ),
    );
    this.pairingCode = options.pairingCode?.trim() || randomPairingCode();
    this.manager = options.manager ?? new GuestAssetBridgeManager();

    const placeholderGrant: GuestAssetBridgeGrant = {
      token: "unpaired",
      origin: "http://127.0.0.1",
      workspaceIds: [],
      operations: [],
      issuedAt: 0,
      expiresAt: 0,
    };
    const transport: GuestAssetBridgeTransport = {
      request: async <T>(request: GuestAssetBridgeRequest) =>
        (await this.requestThroughBrowser(request)) as T,
      close: () => this.disconnectActive(),
    };
    const client = new GuestAssetBridgeClient(transport, placeholderGrant);
    this.connection = createGuestAssetBridgeConnection(client, {
      commandAdapters: createGuestBridgeCommandAdapters(client),
    });

    this.server = createServer((request, response) => {
      void this.handleHttpRequest(request, response);
    });
  }

  async start(): Promise<GuestAssetBridgeHttpHostAddress> {
    if (this.address) return { ...this.address };
    if (!this.server) throw new Error("Guest asset bridge host is closed.");
    await new Promise<void>((resolve, reject) => {
      const server = this.server!;
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(this.port, LOOPBACK_HOST);
    });
    const serverAddress = this.server.address();
    const port =
      typeof serverAddress === "object" && serverAddress
        ? serverAddress.port
        : this.port;
    this.address = {
      host: LOOPBACK_HOST,
      port,
      url: `http://${LOOPBACK_HOST}:${port}${this.endpointPath}`,
      pairingCode: this.pairingCode,
    };
    return { ...this.address };
  }

  async close(): Promise<void> {
    if (this.activeGrant) this.terminateSession(this.activeGrant.token, true);
    const server = this.server;
    this.server = null;
    this.address = null;
    if (!server) return;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  revoke(): void {
    if (this.activeGrant) this.terminateSession(this.activeGrant.token, true);
  }

  private async handleHttpRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const origin = originFrom(request);
    if (request.method === "OPTIONS") {
      if (origin) {
        response.setHeader("access-control-allow-origin", origin);
        response.setHeader("vary", "Origin");
      }
      response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
      response.setHeader("access-control-allow-headers", "content-type");
      response.statusCode = 204;
      response.end();
      return;
    }

    const url = new URL(request.url ?? "/", `http://${LOOPBACK_HOST}`);
    if (
      url.pathname !== this.endpointPath &&
      !url.pathname.startsWith(`${this.endpointPath}/`)
    ) {
      writeJson(response, 404, { error: "not_found" }, origin);
      return;
    }
    const suffix = url.pathname.slice(this.endpointPath.length);
    try {
      if (suffix === "/pair" && request.method === "POST") {
        await this.handlePair(request, response, origin);
        return;
      }
      if (suffix === "/status" && request.method === "GET") {
        writeJson(
          response,
          200,
          {
            paired: Boolean(this.activeGrant),
            expiresAt: this.activeGrant?.expiresAt ?? null,
          },
          origin,
        );
        return;
      }
      if (suffix === "/request" && request.method === "GET") {
        await this.handlePoll(request, response, origin, url);
        return;
      }
      if (suffix === "/response" && request.method === "POST") {
        await this.handleResponse(request, response, origin);
        return;
      }
      if (suffix === "/disconnect" && request.method === "POST") {
        await this.handleDisconnect(request, response, origin);
        return;
      }
      writeJson(response, 405, { error: "method_not_allowed" }, origin);
    } catch (error) {
      if (!response.headersSent) {
        writeJson(response, responseStatus(error), errorBody(error), origin);
      } else {
        response.destroy();
      }
    }
  }

  private async handlePair(
    request: IncomingMessage,
    response: ServerResponse,
    rawOrigin: string,
  ): Promise<void> {
    const origin = assertBrowserOrigin(rawOrigin);
    const body = await readJson(
      request,
      Math.min(this.maxBodyBytes, 64 * 1024),
    );
    if (body.pairingCode !== this.pairingCode) {
      throw new GuestAssetBridgeError(
        "invalid_request",
        "Guest asset bridge pairing requires the one-time code printed by the local MCP process.",
      );
    }
    const workspaceIds = stringArray(body.workspaceIds, "workspaceIds");
    const assetIds =
      body.assetIds === undefined
        ? undefined
        : stringArray(body.assetIds, "assetIds");
    const ttlMs = body.ttlMs === undefined ? undefined : Number(body.ttlMs);
    if (ttlMs !== undefined && !Number.isFinite(ttlMs)) {
      throw new GuestAssetBridgeError(
        "invalid_request",
        "Guest asset bridge ttlMs must be a finite number.",
      );
    }
    const grant = this.manager.pair({
      origin,
      workspaceIds,
      ...(assetIds ? { assetIds } : {}),
      ...(ttlMs === undefined ? {} : { ttlMs }),
    });
    if (this.activeGrant) this.terminateSession(this.activeGrant.token, true);
    this.activeGrant = grant;
    this.queues.set(grant.token, []);
    writeJson(
      response,
      200,
      { grant, endpoint: this.address?.url ?? null },
      origin,
    );
  }

  private requireSession(token: string, origin: string): GuestAssetBridgeGrant {
    const grant = this.manager.authorizeSession(
      token,
      assertBrowserOrigin(origin),
    );
    if (!this.activeGrant || this.activeGrant.token !== grant.token) {
      throw new GuestAssetBridgeError(
        "not_paired",
        "The Guest asset bridge session is no longer active; pair Kagelin again.",
      );
    }
    return grant;
  }

  private async handlePoll(
    request: IncomingMessage,
    response: ServerResponse,
    origin: string,
    url: URL,
  ): Promise<void> {
    const token = url.searchParams.get("token") ?? "";
    const grant = this.requireSession(token, origin);
    if (this.pollWaiter) {
      throw new GuestAssetBridgeError(
        "invalid_request",
        "Only one Guest asset bridge browser poll may be active at a time.",
      );
    }
    const queue = this.queues.get(grant.token) ?? [];
    const next = queue.shift();
    this.queues.set(grant.token, queue);
    if (next) {
      writeJson(
        response,
        200,
        {
          kind: "request",
          request: next,
        },
        assertBrowserOrigin(origin),
      );
      return;
    }

    const waiter: PollWaiter = {
      token: grant.token,
      origin: assertBrowserOrigin(origin),
      response,
      request,
      timer: setTimeout(
        () => {
          this.finishPoll(waiter, { kind: "idle" });
        },
        Math.min(this.requestTimeoutMs, 25_000),
      ),
      settled: false,
    };
    this.pollWaiter = waiter;
    request.once("close", () => {
      if (waiter.settled) return;
      waiter.settled = true;
      clearTimeout(waiter.timer);
      if (this.pollWaiter === waiter) this.pollWaiter = null;
      this.terminateSession(waiter.token, true);
    });
  }

  private finishPoll(waiter: PollWaiter, value: unknown): void {
    if (waiter.settled) return;
    waiter.settled = true;
    clearTimeout(waiter.timer);
    if (this.pollWaiter === waiter) this.pollWaiter = null;
    writeJson(waiter.response, 200, value, waiter.origin);
  }

  private async handleResponse(
    request: IncomingMessage,
    response: ServerResponse,
    origin: string,
  ): Promise<void> {
    const body = decodeGuestAssetBridgeValue(
      await readJson(request, this.maxBodyBytes),
    ) as Record<string, unknown>;
    const token = typeof body.token === "string" ? body.token : "";
    const requestId = typeof body.requestId === "string" ? body.requestId : "";
    this.requireSession(token, origin);
    const key = `${token}:${requestId}`;
    const pending = this.pending.get(key);
    if (!pending) {
      throw new GuestAssetBridgeError(
        "invalid_request",
        `Guest asset bridge response "${requestId}" is not pending.`,
      );
    }
    this.pending.delete(key);
    clearTimeout(pending.timer);
    if (body.ok === true) pending.resolve(body.value);
    else
      pending.reject(
        guestAssetBridgeErrorFromPayload(
          (body.error ?? {}) as Record<string, unknown>,
        ),
      );
    writeJson(response, 200, { ok: true }, assertBrowserOrigin(origin));
  }

  private async handleDisconnect(
    request: IncomingMessage,
    response: ServerResponse,
    origin: string,
  ): Promise<void> {
    const body = await readJson(
      request,
      Math.min(this.maxBodyBytes, 64 * 1024),
    );
    const token = typeof body.token === "string" ? body.token : "";
    this.requireSession(token, origin);
    this.terminateSession(token, true);
    writeJson(
      response,
      200,
      { disconnected: true },
      assertBrowserOrigin(origin),
    );
  }

  private requestThroughBrowser(
    request: GuestAssetBridgeRequest,
  ): Promise<unknown> {
    if (!this.activeGrant) {
      return Promise.reject(
        new GuestAssetBridgeError(
          "not_paired",
          "Guest asset bridge is unavailable; open Kagelin and pair this MCP process before reading local assets.",
        ),
      );
    }
    let grant: GuestAssetBridgeGrant;
    try {
      grant = this.manager.authorizeSession(
        this.activeGrant.token,
        this.activeGrant.origin,
      );
    } catch (error) {
      return Promise.reject(error);
    }
    const scopedRequest = {
      ...request,
      token: grant.token,
      origin: grant.origin,
    };
    return this.manager.dispatch(scopedRequest, {
      handle: (nextRequest) => this.enqueue(nextRequest, grant),
    });
  }

  private enqueue(
    request: GuestAssetBridgeRequest,
    grant: GuestAssetBridgeGrant,
  ): Promise<unknown> {
    const key = `${grant.token}:${request.requestId}`;
    if (this.pending.has(key)) {
      return Promise.reject(
        new GuestAssetBridgeError(
          "invalid_request",
          `Guest asset bridge request "${request.requestId}" is already pending.`,
        ),
      );
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(key);
        reject(
          new GuestAssetBridgeError(
            "timeout",
            "The paired Kagelin browser did not answer the Guest asset bridge request in time.",
            { requestId: request.requestId, timeoutMs: this.requestTimeoutMs },
          ),
        );
      }, this.requestTimeoutMs);
      this.pending.set(key, { token: grant.token, resolve, reject, timer });
      const queue = this.queues.get(grant.token) ?? [];
      const waiter = this.pollWaiter;
      if (waiter && waiter.token === grant.token) {
        this.finishPoll(waiter, { kind: "request", request });
      } else {
        queue.push(request);
        this.queues.set(grant.token, queue);
      }
    });
  }

  private disconnectActive(): void {
    if (this.activeGrant) this.terminateSession(this.activeGrant.token, true);
  }

  private terminateSession(token: string, markDisconnected: boolean): void {
    if (markDisconnected) this.manager.disconnect(token);
    if (this.pollWaiter?.token === token) {
      const waiter = this.pollWaiter;
      waiter.settled = true;
      clearTimeout(waiter.timer);
      this.pollWaiter = null;
      waiter.response.destroy();
    }
    this.queues.delete(token);
    for (const [key, pending] of this.pending) {
      if (pending.token !== token) continue;
      clearTimeout(pending.timer);
      this.pending.delete(key);
      pending.reject(
        new GuestAssetBridgeError(
          "revoked",
          "The Guest asset bridge session disconnected; pair Kagelin again.",
        ),
      );
    }
    if (this.activeGrant?.token === token) this.activeGrant = null;
  }
}

function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed || !trimmed.startsWith("/") || trimmed.includes(".."))
    throw new Error(
      "Guest asset bridge endpointPath must be an absolute safe path.",
    );
  return trimmed.replace(/\/$/, "") || "/";
}
