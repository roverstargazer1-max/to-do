# Kagelin Workspace AI Builder MCP Server

The Kagelin Model Context Protocol (MCP) server enables AI coding assistants (such as Antigravity, Claude Code, and Cursor) to inspect the user's workspace context, review project requirements, scaffold new workspaces, and incrementally patch existing canvases.

Contract version: `1.2.0`. All semantic mutations enter the Workspace
Blueprint Engine and the existing Domain Command layer; the adapter does not
write database rows directly. The optional Skill is the workflow surface, not
the security boundary.

---

## Exposed Tools

1. **`list_workspaces`**
   - Summary: Lists all workspaces with id, name, color, and node count.
   - Parameters: `{}`

2. **`inspect_app_context`**
   - Summary: Returns bounded, Account-scoped projects, habits, and recent tasks to inform live-reference reuse.
   - Parameters: `{ query?: string, entityKind?: "project" | "habit" | "task", entityKinds?: string[], limit?: number }`

3. **`get_workspace_blueprint`**
   - Summary: Returns the semantic snapshot Markdown and structured state of a workspace.
   - Parameters: `{ workspaceId: string }`

4. **`build_workspace`**
   - Summary: Creates a new Workspace from canonical `{ blueprint }` or `{ mermaid }` input and returns a structured/text operation receipt.
   - Parameters: `{ blueprint?: WorkspaceBlueprint, mermaid?: string, requestId?: string }` (legacy flat fields remain accepted with a warning)

5. **`patch_workspace`**
   - Summary: Applies a localized `{ patch }` to an existing Workspace without moving untouched cards; removals/broad batches require `destructiveConfirmation: true`.
   - Parameters: `{ patch?: BlueprintPatch, requestId?: string }` (legacy flat fields remain accepted)

6. **`inspect_visual`**
   - Summary: Reads a specifically targeted image asset or image node on
     demand as lightweight metadata or a bounded thumbnail/crop/original MCP
     `image` content block.
   - Parameters: `{ target?: VisualTarget, representation?: "thumbnail" | "crop" | "original", crop?: VisualCrop, supportsImageContent?: boolean, expectedVersionId?: string }`

7. **`import_visual`** and **`update_visual`**
   - Summary: Import a validated base64/byte payload, public HTTPS URL, or
     authorized asset handle; update metadata/annotations or create a
     confirmed immutable replacement version. These operations can create or
     update one image node and never store bytes in node JSON.

8. **Visual relations and lifecycle**
   - Tools: `list_visual_relations`, `create_visual_relation`,
     `update_visual_relation`, `delete_visual_relation`,
     `delete_visual_asset`, `restore_visual_asset`.
   - Summary: Manage typed, non-executing Visual relations and reversible
     asset lifecycle state; existing canvas Connections and native nodes are
     kept separate.

9. **Image-to-flow confirmation**
   - Tools: `draft_visual_to_flow`, `get_visual_flow_draft`,
     `confirm_visual_flow`, `reject_visual_flow`.
   - Summary: Store an inspectable Step/Decision/Connection proposal first;
     only explicit user confirmation writes native workflow objects through
     Domain Commands, preserving `derived-from` provenance.

See [`instructions.md`](instructions.md) for the MCP contract, error/retry
semantics, and client recipes. The domain node reference is
[`docs/agents/workspace-node-specification.md`](../docs/agents/workspace-node-specification.md).
The compact generic-client workflow is also exposed as the named MCP prompt
`workspace_builder_workflow`.

The v1.2 external contract supports `doc`, `task`, `habit`, `project`, `focus`,
`decision`, `step`, and asset-backed `image` nodes plus visual groups and
Connections. Event nodes and runtime automation semantics are intentionally
unsupported. Guest IndexedDB assets are reachable from a local MCP process
only through a scoped, expiring, revocable Guest asset bridge supplied by the
Kagelin page; when it is unavailable the server returns a machine-readable
bridge error and does not fabricate image data.

---

## Connecting a client

The desktop app serves MCP itself (ADR-0024): the endpoint is mounted on the
embedded server the packaged app already runs, so no source tree, Node install,
or extra process is required.

1. Open **Settings → Account → AI MCP Architect Channel**.
2. Turn the endpoint on. It is off by default.
3. Copy the URL and the access token (or copy a ready-made client
   configuration) into the client and restart it.

```jsonc
{
  "mcpServers": {
    "kagelin": {
      "url": "http://127.0.0.1:<port>/api/mcp",
      "headers": {
        "Authorization": "Bearer <token>",
      },
    },
  },
}
```

- **Claude Desktop**: paste the JSON into `claude_desktop_config.json`.
- **Cursor**: paste the same JSON into `~/.cursor/mcp.json`.
- **Claude Code CLI**:

  ```bash
  claude mcp add --transport http kagelin http://127.0.0.1:<port>/api/mcp \
    --header "Authorization: Bearer <token>"
  ```

The port is the one the app is already served from and stays stable across
launches. The token lives in the app's userData directory (`mcp-token`, mode
`0600`) and survives restarts; **Reset token** in the same card rotates it
immediately — every client has to be updated with the new value.

The endpoint speaks the standard MCP Streamable HTTP transport: POST for
JSON-RPC (SSE streaming or plain JSON responses), GET for the server-to-client
SSE channel, DELETE to end a session, and `Mcp-Session-Id` for session reuse.

---

## Running from a source tree (development only)

`npm run mcp:start` still exposes the same server over **stdio** for headless
and CI debugging. It is a developer path only: client configurations that
reference `node_modules/tsx` and `mcp-server/index.ts` require this repository
on disk and cannot work for an installed build.

```bash
npm run mcp:start
```

The server opens the same local SQLite database as the desktop app through
`better-sqlite3` in WAL mode, so tools work whether or not the Kagelin window is
open. The default path is `%APPDATA%\Kagelin\data.db` on Windows (with the
standard application data directories on macOS/Linux) and
`.scratch/data.dev.db` in development; override it with `KAGELIN_DB_PATH`.
Identity defaults to the local account and may be overridden with
`KAGELIN_MCP_USER_ID`. No Docker, Supabase stack, or pairing step is required.

Serving the HTTP endpoint from a dev checkout (`npm run dev`) is possible when
you inject the credentials yourself:

```bash
KAGELIN_MCP_TOKEN=<any-random-string> npm run dev
```

`KAGELIN_MOCK_MODE=true` is reserved for tests and local mock fixtures; it is
not a substitute for the local database.

## Skill and generic-client distribution

The canonical Skill source is
[`skills/kagelin-workspace-builder/SKILL.md`](../skills/kagelin-workspace-builder/SKILL.md).
Install or map that one file into the host's Skill directory for a
Skill-capable client; client-specific copies are not maintained. Its current
version and the minimum compatible MCP contract are recorded in
[`docs/agents/workspace-ai-contract.md`](../docs/agents/workspace-ai-contract.md).

For a client that cannot load Skills, connect to this MCP server and request
the named prompt `workspace_builder_workflow`. Follow the returned compact
sequence: inspect relevant context, resolve an explicit existing target and
read its snapshot, choose Blueprint or Mermaid for creation, use localized
patches for existing Workspaces, obtain deletion confirmation, consume the
receipt, and re-read when verification is warranted. The full tool contract
remains in [`instructions.md`](instructions.md).

---

## Client Configurations (stdio, development only)

These configurations point at the source tree and therefore only work on a
developer machine. For an installed app use the URL + header form above.

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
        "KAGELIN_DB_PATH": "C:/Users/<you>/AppData/Roaming/Kagelin/data.db"
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
        "KAGELIN_DB_PATH": "C:/Users/<you>/AppData/Roaming/Kagelin/data.db"
      }
    }
  }
}
```
