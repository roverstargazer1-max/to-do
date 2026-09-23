import type { McpAccessStore } from "../src/lib/mcp/token";

/**
 * Renderer-facing surface for the in-app MCP endpoint (ADR-0024).
 *
 * The token never leaves the main process through a web endpoint — only this
 * IPC surface can read it — so the settings card is the single place it is
 * displayed, and the loopback URL is derived from the port the packaged
 * renderer is already served from.
 */

export const MCP_STATUS_CHANNEL = "mcp:status";
export const MCP_SET_ENABLED_CHANNEL = "mcp:set-enabled";
export const MCP_RESET_TOKEN_CHANNEL = "mcp:reset-token";

export interface McpChannelStatus {
  /** False for source-tree dev runs, which have no embedded server process. */
  available: boolean;
  /** The embedded Next.js server process is alive. */
  running: boolean;
  enabled: boolean;
  token: string | null;
  url: string;
}

export interface McpBridgeContext {
  store: McpAccessStore;
  resolveUrl: () => string;
  isAvailable: () => boolean;
  isRunning: () => boolean;
}

export interface McpBridgeIpc {
  handle(
    channel: string,
    listener: (event: unknown, payload?: unknown) => unknown,
  ): void;
}

export function readMcpChannelStatus(
  context: McpBridgeContext,
): McpChannelStatus {
  const available = context.isAvailable();
  return {
    available,
    running: context.isRunning(),
    enabled: available && context.store.isEnabled(),
    token: available ? context.store.readToken() : null,
    url: context.resolveUrl(),
  };
}

export function registerMcpBridge(
  ipc: McpBridgeIpc,
  context: McpBridgeContext,
): void {
  ipc.handle(MCP_STATUS_CHANNEL, () => readMcpChannelStatus(context));

  ipc.handle(MCP_SET_ENABLED_CHANNEL, (_event, payload) => {
    context.store.setEnabled(payload === true);
    return readMcpChannelStatus(context);
  });

  ipc.handle(MCP_RESET_TOKEN_CHANNEL, () => {
    context.store.resetToken();
    return readMcpChannelStatus(context);
  });
}
