# Kagelin Workspace AI Builder MCP Server

The Kagelin Model Context Protocol (MCP) server enables AI coding assistants (such as Antigravity, Claude Code, and Cursor) to inspect the user's workspace context, review project requirements, scaffold new workspaces, and incrementally patch existing canvases.

All mutations are executed strictly through Kagelin's domain command layer (`workspaceCommands`, `nodeCommands`, `edgeCommands`, `taskCommands`), ensuring complete data integrity with zero backdoor writes.

---

## Exposed Tools

1. **`list_workspaces`**
   - Summary: Lists all workspaces with id, name, color, and node count.
   - Parameters: `{}`

2. **`inspect_app_context`**
   - Summary: Returns user's projects, habits, and recent tasks to inform intelligent entity reuse.
   - Parameters: `{ limit?: number }` (default: 20)

3. **`get_workspace_blueprint`**
   - Summary: Returns the semantic snapshot Markdown and structured state of a workspace.
   - Parameters: `{ workspaceId: string }`

4. **`build_workspace`**
   - Summary: Compiles a semantic workspace blueprint and creates all canvas nodes, groups, and connections.
   - Parameters: `WorkspaceBlueprint` (name, color?, sections, flows?)

5. **`patch_workspace`**
   - Summary: Applies incremental semantic additions, updates, deletions, and connections to an existing workspace without moving untouched cards.
   - Parameters: `BlueprintPatch` (workspaceId, addItems?, removeNodeIds?, updateDocs?, addFlows?, removeEdgeIds?)

---

## Running Locally

Run with `npm run mcp:start` or directly with `tsx`:

```bash
npm run mcp:start
```

---

## Client Configurations

### 1. Antigravity Configuration (`mcp_config.json`)

Add the following entry to your Antigravity configuration file (e.g. in your workspace or global config):

```json
{
  "mcpServers": {
    "kagelin-workspace-builder": {
      "command": "node",
      "args": [
        "D:/Projects/to-do/kagelin/node_modules/tsx/dist/cli.mjs",
        "--tsconfig",
        "D:/Projects/to-do/kagelin/tsconfig.json",
        "D:/Projects/to-do/kagelin/mcp-server/index.ts"
      ],
      "env": {
        "KAGELIN_MOCK_MODE": "false"
      }
    }
  }
}
```

### 2. Claude Desktop Configuration (`claude_desktop_config.json`)

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kagelin": {
      "command": "npx",
      "args": ["-y", "tsx", "<path-to-kagelin>/mcp-server/index.ts"],
      "env": {
        "NEXT_PUBLIC_SUPABASE_URL": "http://localhost:54321",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY": "<your-anon-key>"
      }
    }
  }
}
```
