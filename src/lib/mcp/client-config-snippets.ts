/**
 * Client-safe MCP presentation data.
 *
 * The settings card runs in the renderer, so nothing here may import the
 * fs-backed access store. This module only formats the endpoint URL and token
 * into the three client recipes the spec calls for (ADR-0024).
 */

export const MCP_ENDPOINT_PATH = "/api/mcp";
export const MCP_SERVER_KEY = "kagelin";

export type McpClientSnippetId = "claude-desktop" | "cursor" | "claude-code";

export interface McpClientSnippet {
  id: McpClientSnippetId;
  language: "json" | "bash";
  content: string;
}

export interface McpClientSnippetInput {
  /** Full endpoint URL, e.g. `http://127.0.0.1:4321/api/mcp`. */
  url: string;
  token: string;
}

const MASK_PREFIX_LENGTH = 8;
const MASK_VISIBLE_TAIL = 4;

/**
 * Display mask for the token field: enough of the tail to tell one token from
 * another, never enough to use it.
 */
export function maskMcpToken(token: string): string {
  if (token.length <= MASK_VISIBLE_TAIL) {
    return "•".repeat(token.length);
  }
  return `${"•".repeat(MASK_PREFIX_LENGTH)}${token.slice(-MASK_VISIBLE_TAIL)}`;
}

function urlHeadersConfig(url: string, token: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        [MCP_SERVER_KEY]: {
          url,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );
}

export function buildMcpClientSnippets({
  url,
  token,
}: McpClientSnippetInput): McpClientSnippet[] {
  return [
    {
      id: "claude-desktop",
      language: "json",
      content: urlHeadersConfig(url, token),
    },
    {
      id: "cursor",
      language: "json",
      content: urlHeadersConfig(url, token),
    },
    {
      id: "claude-code",
      language: "bash",
      content: `claude mcp add --transport http ${MCP_SERVER_KEY} ${url} --header "Authorization: Bearer ${token}"`,
    },
  ];
}
