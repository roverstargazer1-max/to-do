import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MCP_RESET_TOKEN_CHANNEL,
  MCP_SET_ENABLED_CHANNEL,
  MCP_STATUS_CHANNEL,
  readMcpChannelStatus,
  registerMcpBridge,
  type McpBridgeContext,
  type McpChannelStatus,
} from "../../../electron/mcp-bridge";
import { createMcpAccessStore } from "@/lib/mcp/token";

type IpcHandler = (event: unknown, payload?: unknown) => unknown;

function createContext(
  directory: string,
  overrides: Partial<McpBridgeContext> = {},
): McpBridgeContext {
  return {
    store: createMcpAccessStore(directory),
    resolveUrl: () => "http://127.0.0.1:4321/api/mcp",
    isAvailable: () => true,
    isRunning: () => true,
    ...overrides,
  };
}

describe("MCP renderer bridge", () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "kagelin-mcp-bridge-"));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("hides the token and reports unavailable in builds without an embedded endpoint", () => {
    const context = createContext(directory, { isAvailable: () => false });
    context.store.ensureToken();
    context.store.setEnabled(true);

    expect(readMcpChannelStatus(context)).toEqual({
      available: false,
      running: true,
      enabled: false,
      token: null,
      url: "http://127.0.0.1:4321/api/mcp",
    });
  });

  it("reports the persisted token, switch state, and loopback url", () => {
    const context = createContext(directory);
    expect(readMcpChannelStatus(context).enabled).toBe(false);
    expect(readMcpChannelStatus(context).token).toBeNull();

    const token = context.store.ensureToken();
    context.store.setEnabled(true);

    expect(readMcpChannelStatus(context)).toEqual({
      available: true,
      running: true,
      enabled: true,
      token,
      url: "http://127.0.0.1:4321/api/mcp",
    });
  });

  it("routes renderer calls to the access store", () => {
    const handlers = new Map<string, IpcHandler>();
    const context = createContext(directory);
    registerMcpBridge(
      {
        handle: (channel, listener) => {
          handlers.set(channel, listener);
        },
      },
      context,
    );

    expect([...handlers.keys()].sort()).toEqual(
      [
        MCP_SET_ENABLED_CHANNEL,
        MCP_RESET_TOKEN_CHANNEL,
        MCP_STATUS_CHANNEL,
      ].sort(),
    );

    const status = handlers.get(MCP_STATUS_CHANNEL)!(null) as McpChannelStatus;
    expect(status.enabled).toBe(false);

    const enabled = handlers.get(MCP_SET_ENABLED_CHANNEL)!(
      null,
      true,
    ) as McpChannelStatus;
    expect(enabled.enabled).toBe(true);
    expect(context.store.isEnabled()).toBe(true);

    const before = context.store.readToken();
    const rotated = handlers.get(MCP_RESET_TOKEN_CHANNEL)!(
      null,
    ) as McpChannelStatus;
    expect(rotated.token).toBeTruthy();
    expect(rotated.token).not.toBe(before);
    expect(context.store.readToken()).toBe(rotated.token);
  });
});
