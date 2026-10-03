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

export function isAuthorizedSender(
  event: unknown,
  expectedUrl: string,
): boolean {
  if (!event || typeof event !== "object") return true;
  const invokeEvent = event as {
    senderFrame?: { parent: unknown; url?: string };
  };
  if (!invokeEvent.senderFrame) return true;
  // Disallow child frames/iframes
  if (invokeEvent.senderFrame.parent !== null) return false;
  if (!invokeEvent.senderFrame.url) return false;
  try {
    const senderOrigin = new URL(invokeEvent.senderFrame.url).origin;
    const expectedOrigin = new URL(expectedUrl).origin;
    return senderOrigin === expectedOrigin;
  } catch {
    return false;
  }
}

export function registerMcpBridge(
  ipc: McpBridgeIpc,
  context: McpBridgeContext,
): void {
  ipc.handle(MCP_STATUS_CHANNEL, (event) => {
    if (!isAuthorizedSender(event, context.resolveUrl())) {
      throw new Error("Unauthorized IPC invocation");
    }
    return readMcpChannelStatus(context);
  });

  ipc.handle(MCP_SET_ENABLED_CHANNEL, (event, payload) => {
    if (!isAuthorizedSender(event, context.resolveUrl())) {
      throw new Error("Unauthorized IPC invocation");
    }
    context.store.setEnabled(payload === true);
    return readMcpChannelStatus(context);
  });

  ipc.handle(MCP_RESET_TOKEN_CHANNEL, (event) => {
    if (!isAuthorizedSender(event, context.resolveUrl())) {
      throw new Error("Unauthorized IPC invocation");
    }
    context.store.resetToken();
    return readMcpChannelStatus(context);
  });
}
