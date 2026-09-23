/**
 * Adversarial-point test for the MCP Streamable HTTP transport factory.
 *
 * The handler is mounted on a real `node:http` server so every assertion is
 * made against actual wire behavior — status codes, headers, SSE framing, and
 * `Mcp-Session-Id` reuse — rather than against SDK internals.
 */

import * as http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MCP_SESSION_HEADER,
  createHttpHandler,
  type McpHttpHandler,
} from "@/lib/mcp/http-transport";
import { createKagelinMcpServer } from "../../../mcp-server/server";

const VALID_TOKEN = "test-loopback-token";
const WRONG_TOKEN = "test-loopback-token-tampered";
const SSE_ACCEPT = "application/json, text/event-stream";
const INIT_PARAMS = {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "kagelin-http-test", version: "0.0.0" },
};

const MOCK_WORKSPACE = {
  id: "ws-1",
  name: "Q3 Roadmap",
  color: "#3B82F6",
  user_id: "user-1",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

function createMockServer() {
  return createKagelinMcpServer({
    useMockFallback: true,
    identity: "user-1",
    initialWorkspaces: [MOCK_WORKSPACE],
    initialNodes: [],
    initialEdges: [],
  });
}

/** Minimal Node HTTP <-> Fetch adapter: the factory speaks Request/Response. */
async function adaptRequest(
  handler: McpHttpHandler,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk as Buffer));

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(", "));
  }

  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
  const request = new Request(
    `http://${req.headers.host ?? "127.0.0.1"}${req.url ?? "/"}`,
    { method: req.method ?? "GET", headers, body },
  );

  const response = await handler(request);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  // Streams (SSE) only reach the client once headers are flushed; without this
  // the test's `fetch` would block until the first keep-alive frame.
  res.flushHeaders();
  if (response.body) {
    for await (const chunk of response.body) res.write(chunk);
  }
  res.end();
}

interface TestEndpoint {
  url: string;
  close: () => Promise<void>;
}

async function listen(handler: McpHttpHandler): Promise<TestEndpoint> {
  const server = http.createServer((req, res) => {
    adaptRequest(handler, req, res).catch((error: unknown) => {
      res.statusCode = 500;
      res.end(String(error));
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/api/mcp`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

interface McpPostOptions {
  token?: string | null;
  sessionId?: string | null;
  accept?: string;
}

function mcpPost(
  url: string,
  message: Record<string, unknown>,
  options: McpPostOptions = {},
): Promise<Response> {
  const { token = VALID_TOKEN, sessionId, accept = SSE_ACCEPT } = options;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept,
  };
  if (token) headers.authorization = `Bearer ${token}`;
  if (sessionId) headers[MCP_SESSION_HEADER] = sessionId;
  return fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(message),
  });
}

function mcpGet(
  url: string,
  options: { token?: string | null; sessionId?: string | null } = {},
): Promise<Response> {
  const { token = VALID_TOKEN, sessionId } = options;
  const headers: Record<string, string> = { accept: "text/event-stream" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (sessionId) headers[MCP_SESSION_HEADER] = sessionId;
  return fetch(url, { method: "GET", headers });
}

function mcpDelete(
  url: string,
  options: { token?: string | null; sessionId?: string | null } = {},
): Promise<Response> {
  const { token = VALID_TOKEN, sessionId } = options;
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (sessionId) headers[MCP_SESSION_HEADER] = sessionId;
  return fetch(url, { method: "DELETE", headers });
}

/** POST streams are closed once the response is written, so `text()` settles. */
async function readSseMessages(response: Response): Promise<any[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => JSON.parse(line.slice("data:".length).trim()));
}

async function initializeSession(url: string): Promise<string> {
  const response = await mcpPost(url, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: INIT_PARAMS,
  });
  expect(response.status).toBe(200);
  const sessionId = response.headers.get(MCP_SESSION_HEADER);
  expect(sessionId).toBeTruthy();
  const [message] = await readSseMessages(response);
  expect(message.error).toBeUndefined();
  return sessionId as string;
}

async function notifyInitialized(
  url: string,
  sessionId: string,
): Promise<Response> {
  return mcpPost(
    url,
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { sessionId },
  );
}

describe("MCP Streamable HTTP transport", () => {
  let endpoint: TestEndpoint;
  let enabled = true;

  beforeAll(async () => {
    endpoint = await listen(
      createHttpHandler({
        createServer: createMockServer,
        tokenValidator: (token) => token === VALID_TOKEN,
        isEnabled: () => enabled,
      }),
    );
  });

  afterAll(async () => {
    await endpoint.close();
  });

  it("runs initialize -> tools/list -> tools/call over the SSE path", async () => {
    const sessionId = await initializeSession(endpoint.url);

    expect((await notifyInitialized(endpoint.url, sessionId)).status).toBe(202);

    const listResponse = await mcpPost(
      endpoint.url,
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { sessionId },
    );
    expect(listResponse.status).toBe(200);
    expect(listResponse.headers.get("content-type")).toContain(
      "text/event-stream",
    );
    expect(listResponse.headers.get(MCP_SESSION_HEADER)).toBe(sessionId);

    const [listMessage] = await readSseMessages(listResponse);
    const toolNames = listMessage.result.tools.map(
      (tool: { name: string }) => tool.name,
    );
    expect(toolNames).toContain("list_workspaces");
    expect(toolNames).toContain("patch_workspace");

    const callResponse = await mcpPost(
      endpoint.url,
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "list_workspaces", arguments: {} },
      },
      { sessionId },
    );
    expect(callResponse.status).toBe(200);
    const [callMessage] = await readSseMessages(callResponse);
    const payload = JSON.parse(callMessage.result.content[0].text);
    expect(payload.workspaces[0]).toMatchObject({
      id: "ws-1",
      name: "Q3 Roadmap",
    });
  });

  it("answers a plain JSON client that never asks for a stream", async () => {
    const response = await mcpPost(
      endpoint.url,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: INIT_PARAMS,
      },
      { accept: "application/json" },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const sessionId = response.headers.get(MCP_SESSION_HEADER);
    expect(sessionId).toBeTruthy();
    const message = await response.json();
    expect(message.result.serverInfo.name).toBe("kagelin-workspace-ai-builder");

    const listResponse = await mcpPost(
      endpoint.url,
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { sessionId, accept: "application/json" },
    );
    expect(listResponse.status).toBe(200);
    expect(listResponse.headers.get("content-type")).toContain(
      "application/json",
    );
    const listMessage = await listResponse.json();
    expect(listMessage.result.tools.length).toBeGreaterThan(0);
  });

  it("rejects missing, wrong, and accepts valid tokens", async () => {
    const initialize = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: INIT_PARAMS,
    };

    const missing = await mcpPost(endpoint.url, initialize, { token: null });
    expect(missing.status).toBe(401);
    expect(missing.headers.get("www-authenticate")).toContain("Bearer");
    expect((await missing.json()).error.message).toBe("Unauthorized");

    const wrong = await mcpPost(endpoint.url, initialize, {
      token: WRONG_TOKEN,
    });
    expect(wrong.status).toBe(401);

    const valid = await mcpPost(endpoint.url, initialize);
    expect(valid.status).toBe(200);
  });

  it("refuses every method with 403 while the endpoint is disabled", async () => {
    enabled = false;
    try {
      const response = await mcpPost(endpoint.url, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: INIT_PARAMS,
      });
      expect(response.status).toBe(403);
      expect((await response.json()).error.message).toContain("disabled");
    } finally {
      enabled = true;
    }
  });

  it("keeps the session across requests and rejects unknown session ids", async () => {
    const sessionId = await initializeSession(endpoint.url);
    await notifyInitialized(endpoint.url, sessionId);

    const first = await mcpPost(
      endpoint.url,
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { sessionId },
    );
    const second = await mcpPost(
      endpoint.url,
      { jsonrpc: "2.0", id: 3, method: "tools/list" },
      { sessionId },
    );

    expect(first.headers.get(MCP_SESSION_HEADER)).toBe(sessionId);
    expect(second.headers.get(MCP_SESSION_HEADER)).toBe(sessionId);

    const [firstMessage] = await readSseMessages(first);
    const [secondMessage] = await readSseMessages(second);
    expect(secondMessage.result.tools).toHaveLength(
      firstMessage.result.tools.length,
    );

    const unknown = await mcpPost(
      endpoint.url,
      { jsonrpc: "2.0", id: 4, method: "tools/list" },
      { sessionId: "11111111-2222-3333-4444-555555555555" },
    );
    expect(unknown.status).toBe(404);
  });

  it("opens the standalone SSE channel for a live session and 404s a stale one", async () => {
    const sessionId = await initializeSession(endpoint.url);

    const channel = await mcpGet(endpoint.url, { sessionId });
    expect(channel.status).toBe(200);
    expect(channel.headers.get("content-type")).toContain("text/event-stream");
    await channel.body?.cancel();

    const stale = await mcpGet(endpoint.url, { sessionId: "not-a-session" });
    expect(stale.status).toBe(404);

    const sessionless = await mcpGet(endpoint.url);
    expect(sessionless.status).toBe(400);
  });

  it("terminates a session with DELETE and then forgets it", async () => {
    const sessionId = await initializeSession(endpoint.url);

    const terminated = await mcpDelete(endpoint.url, { sessionId });
    expect(terminated.status).toBe(200);

    const afterDelete = await mcpPost(
      endpoint.url,
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { sessionId },
    );
    expect(afterDelete.status).toBe(404);
  });
});
