/**
 * Streamable HTTP transport for the in-app MCP endpoint.
 *
 * Pure factory: it owns the SDK transport, session bookkeeping, and the
 * authorization gate, but nothing about how the host server listens. The
 * `/api/mcp` route is a thin shell around this handler, and tests mount it on a
 * plain `node:http` server to exercise the real wire behavior.
 *
 * One `McpServer` serves exactly one transport session (the SDK rejects a
 * second `connect()` on the same instance), so sessions are built lazily from
 * `createServer` and dropped when their transport closes.
 */

import crypto from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { McpTokenValidator } from "@/lib/mcp/token";

export const MCP_SESSION_HEADER = "mcp-session-id";

const STREAM_CONTENT_TYPE = "text/event-stream";
/** Accept header handed to SDK transports that answer plain JSON. */
const JSON_CLIENT_ACCEPT = "application/json, text/event-stream";

export interface McpHttpHandlerOptions {
  /** Builds the MCP server bound to a single transport session. */
  createServer: () => McpServer;
  /** Narrow credential check; swap for OAuth without touching the transport. */
  tokenValidator: McpTokenValidator;
  /** Endpoint switch (settings page). Defaults to always available. */
  isEnabled?: () => boolean;
}

export type McpHttpHandler = (request: Request) => Promise<Response>;

interface McpSession {
  server: McpServer;
  transport: WebStandardStreamableHTTPServerTransport;
}

function errorResponse(
  status: number,
  message: string,
  headers?: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message },
      id: null,
    }),
    {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    },
  );
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}

function acceptsEventStream(acceptHeader: string | null): boolean {
  return acceptHeader?.includes(STREAM_CONTENT_TYPE) ?? false;
}

/**
 * The SDK requires POST clients to accept both `application/json` and
 * `text/event-stream`. Plain-JSON clients (curl, minimal scripts) only announce
 * `application/json`, so a JSON-mode session widens the header the SDK sees
 * while keeping the synchronous JSON response the client actually asked for.
 */
function withJsonClientAccept(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.set("accept", JSON_CLIENT_ACCEPT);
  return new Request(request, { headers });
}

export function createHttpHandler(
  options: McpHttpHandlerOptions,
): McpHttpHandler {
  const { createServer, tokenValidator, isEnabled = () => true } = options;
  const sessions = new Map<string, McpSession>();

  async function openSession(jsonResponse: boolean): Promise<McpSession> {
    let session: McpSession | null = null;
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      enableJsonResponse: jsonResponse,
      onsessioninitialized: (sessionId) => {
        if (session) sessions.set(sessionId, session);
      },
    });
    const server = createServer();
    session = { server, transport };
    // `close()` runs on DELETE and fires this hook; `connect()` chains it with
    // the protocol's own cleanup, so an explicit `server.close()` is neither
    // needed nor safe here (it would re-enter the transport).
    transport.onclose = () => {
      const sessionId = transport.sessionId;
      if (sessionId) sessions.delete(sessionId);
    };
    await server.connect(transport);
    return session;
  }

  return async function handleMcpRequest(request: Request): Promise<Response> {
    if (!isEnabled()) {
      return errorResponse(
        403,
        "MCP endpoint is disabled. Enable it in Kagelin Settings.",
      );
    }
    if (!tokenValidator(bearerToken(request))) {
      return errorResponse(401, "Unauthorized", {
        "WWW-Authenticate": 'Bearer realm="kagelin-mcp"',
      });
    }

    const streaming = acceptsEventStream(request.headers.get("accept"));
    const forwardedRequest =
      request.method === "POST" && !streaming
        ? withJsonClientAccept(request)
        : request;

    const sessionId = request.headers.get(MCP_SESSION_HEADER);
    const session = sessionId ? sessions.get(sessionId) : undefined;
    if (session) {
      return session.transport.handleRequest(forwardedRequest);
    }

    // A client naming a session we do not hold is out of sync. Answering here
    // (instead of through a throwaway transport) keeps a stray request from
    // opening a server no response will ever reach.
    if (sessionId) {
      return errorResponse(404, "Session not found");
    }

    // GET (SSE channel) and DELETE (terminate) only make sense inside a live
    // session, so they never open one.
    if (request.method !== "POST") {
      return errorResponse(
        400,
        "Bad Request: Mcp-Session-Id header is required",
      );
    }

    const opened = await openSession(!streaming);
    return opened.transport.handleRequest(forwardedRequest);
  };
}
