import { describe, expect, it } from "vitest";
import {
  buildMcpClientSnippets,
  maskMcpToken,
  MCP_ENDPOINT_PATH,
} from "@/lib/mcp/client-config-snippets";

const URL = `http://127.0.0.1:4321${MCP_ENDPOINT_PATH}`;
const TOKEN = "8Qw3ZtRk1sVp0LmN7yBcXdEfGh2Jk4Mn6Pq8Rs0Tu1W";

describe("MCP client configuration snippets", () => {
  it("builds the three client recipes from the endpoint and token", () => {
    const snippets = buildMcpClientSnippets({ url: URL, token: TOKEN });

    expect(snippets.map((snippet) => snippet.id)).toEqual([
      "claude-desktop",
      "cursor",
      "claude-code",
    ]);
  });

  it("emits url + Authorization headers for the JSON clients", () => {
    const snippets = buildMcpClientSnippets({ url: URL, token: TOKEN });
    const jsonSnippets = snippets.filter(
      (snippet) => snippet.language === "json",
    );

    expect(jsonSnippets).toHaveLength(2);
    for (const snippet of jsonSnippets) {
      expect(JSON.parse(snippet.content)).toEqual({
        mcpServers: {
          kagelin: {
            url: URL,
            headers: { Authorization: `Bearer ${TOKEN}` },
          },
        },
      });
    }
  });

  it("emits a header-bearing CLI command for Claude Code", () => {
    const command = buildMcpClientSnippets({ url: URL, token: TOKEN }).find(
      (snippet) => snippet.id === "claude-code",
    );

    expect(command?.language).toBe("bash");
    expect(command?.content).toBe(
      `claude mcp add --transport http kagelin ${URL} --header "Authorization: Bearer ${TOKEN}"`,
    );
  });

  it("never prints a usable token in the display mask", () => {
    const masked = maskMcpToken(TOKEN);

    expect(masked).not.toContain(TOKEN);
    expect(masked).toContain(TOKEN.slice(-4));
    expect(masked).toBe(`••••••••${TOKEN.slice(-4)}`);
    expect(maskMcpToken("abc")).toBe("•••");
  });
});
