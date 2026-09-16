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

## Running Locally

Run with `npm run mcp:start` or directly with `tsx`:

```bash
npm run mcp:start
```

Real mode fails closed unless the process has an explicit Account identity and
can authenticate that identity. A standalone stdio process started through
`mcp-server/index.ts` can use the server-side Supabase secret key:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SECRET_KEY=<server-only-secret-key>
KAGELIN_MCP_USER_ID=<authenticated-account-id>
```

The secret key must remain in `.env.local` or another protected local server
environment. Never expose it to browser code, commit it, or deploy it as a
public client variable. An embedding caller may instead provide a
session-bound Supabase client. `KAGELIN_MOCK_MODE=true` is reserved for tests
and local mock fixtures; it is not an authentication substitute for a real
Account.

When `NEXT_PUBLIC_SUPABASE_URL` points to the local default
`http://127.0.0.1:54321`, start the local Supabase stack before starting the
MCP client:

```bash
npx supabase start
curl --fail http://127.0.0.1:54321/auth/v1/health
```

If Workspace tools return `MCP Server could not reach the configured Supabase
endpoint`, check that Docker Desktop is running, the configured URL is
reachable from the MCP process, and the local stack or hosted Supabase project
is healthy. The MCP server never falls back to mock data in real mode.

### Guest IndexedDB bridge

For a Guest Workspace, start the local MCP process in Guest bridge mode:

```dotenv
KAGELIN_MCP_USE_GUEST_BRIDGE=true
KAGELIN_GUEST_BRIDGE_PORT=37373
```

The process binds only to `127.0.0.1` and prints a temporary pairing code to
stderr. In the Kagelin Guest Workspace, choose **Pair local MCP**, enter the
printed endpoint and code, and confirm the displayed Workspace scope. The
browser page then owns the long-poll session and executes the existing Domain
Commands; the MCP process receives only explicitly authorized requests. The
button can revoke the grant at any time, and the grant also expires
automatically. Image bytes are not included in `get_workspace_blueprint`; a
client must call `inspect_visual` with an explicit node/asset/resource ID.

The default endpoint is
`http://127.0.0.1:37373/kagelin/guest-asset-bridge`. A different port may be
used through `KAGELIN_GUEST_BRIDGE_PORT`; it remains loopback-only. Do not
expose this endpoint or pairing code to a remote MCP client. When an explicit
Account identity or server key is configured, `mcp-server/index.ts` keeps the
existing cloud mode and does not attach the Guest bridge unless
`KAGELIN_MCP_USE_GUEST_BRIDGE=true` is set deliberately.

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
        "NEXT_PUBLIC_SUPABASE_URL": "https://<project>.supabase.co",
        "SUPABASE_SECRET_KEY": "<server-only-secret-key>",
        "KAGELIN_MCP_USER_ID": "<authenticated-account-id>"
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
        "SUPABASE_SECRET_KEY": "<server-only-secret-key>",
        "KAGELIN_MCP_USER_ID": "<authenticated-account-id>"
      }
    }
  }
}
```
