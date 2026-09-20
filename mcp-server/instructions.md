# Kagelin Workspace Builder MCP reference

This is the MCP contract reference for generic clients. The Workspace domain
semantics and persistence rules remain authoritative in
[`docs/agents/workspace-node-specification.md`](../docs/agents/workspace-node-specification.md)
and the Blueprint Engine sources. The Skill owns conversational workflow
orchestration; this document owns tool-level inputs, outputs, safety, and retry
behavior.

## Contract boundary

- MCP contract/server version: `1.2.0`.
- Canonical build input: `{ blueprint: WorkspaceBlueprint }`.
- Supported topology-first input: `{ mermaid: string }`.
- Canonical patch input: `{ patch: BlueprintPatch }`.
- Legacy flat aliases remain accepted and return `inputForm: "legacy"` plus a
  migration warning.
- v1.2 supported node kinds: `doc`, `task`, `habit`, `project`, `focus`,
  `decision`, `step`, and the asset-backed `image` node. Event nodes are
  rejected as unsupported.
- Connections are visual layout relationships only. They have no runtime
  trigger, scheduling, evaluation, execution, or dependency-propagation
  semantics.

## Tools

### `list_workspaces`

Read the active Account's Workspace IDs, names, colors, and bounded node
counts. Use it to resolve an existing target before patching. It is read-only.

Input: `{}`.

### `inspect_app_context`

Read bounded Account-scoped domain context before creation so matching live
references can be reused.

Input:

```json
{
  "query": "optional case-insensitive text",
  "entityKind": "project | habit | task",
  "entityKinds": ["project", "habit", "task"],
  "limit": 20
}
```

`limit` is an integer from 1 through 100 and applies to each returned
collection. `kind` is retained as a legacy alias for `entityKind`. No separate
search tool is required.

### `get_workspace_blueprint`

Read the current semantic snapshot before an existing-Workspace patch.

Input: `{ "workspaceId": "account-owned-workspace-id" }`.

The result contains `markdown` and `snapshot`. The snapshot includes current
node and Connection IDs, group membership, coordinates, sizes, semantic
references, orphan markers, lightweight image descriptors, typed Visual
relations, and visual edge endpoints. It is read-only and contains no image
bytes.

### `inspect_visual`

Read one explicitly targeted Visual asset or image node. Supply a
`workspaceId` plus `nodeId`, `assetId`, `resourceId`, or a unique image title;
canvas selection is never a target. With no `representation`, the response is
the lightweight descriptor. `thumbnail`, `crop`, and `original` are read only
when requested. A client that supports MCP image content receives a standard
`{ "type": "image", "data": "<base64>", "mimeType": "image/..." }`
content block. A text-only client receives metadata and any ready OCR or
description with `equivalentToImage: false`.

### `build_workspace`

Create a new Workspace. It always creates; it never modifies an existing
Workspace.

Canonical examples:

```json
{
  "requestId": "optional-local-retry-key",
  "blueprint": {
    "name": "Release flow",
    "sections": [
      {
        "id": "prepare",
        "title": "Prepare",
        "isGroup": true,
        "items": [
          { "id": "spec", "kind": "doc", "title": "Spec", "content": "..." },
          {
            "id": "ship",
            "kind": "task",
            "content": "Ship it",
            "existingTaskId": "task-id"
          }
        ]
      }
    ],
    "flows": [{ "fromItemId": "spec", "toItemId": "ship" }]
  }
}
```

For a concise graph-shaped request, pass `mermaid` instead. The server
validates item references, supported kinds, duplicate/self Connections, and
live-reference ownership before the Blueprint Engine starts writing.

The success receipt includes:

- `workspaceId` and `requestId` when supplied;
- `itemNodeIds`, mapping semantic item/section IDs to persisted node IDs;
- `linkedEntityIds` and `createdEntityIds` for Task/Habit/Project references;
- added node and Connection IDs, counts, `inputForm`, and warnings;
- `status: "succeeded"` and `replayed: false` on the first execution.

### `patch_workspace`

Apply only a localized change to an existing Workspace. Read the current
snapshot first and use its IDs. Never express a localized change as a build.

Canonical example:

```json
{
  "requestId": "optional-local-retry-key",
  "patch": {
    "workspaceId": "workspace-id",
    "addItems": [
      {
        "targetGroupId": "group-node-id",
        "item": { "id": "new-step", "kind": "step", "title": "Verify" }
      }
    ],
    "updateDocs": [{ "nodeId": "doc-node-id", "content": "Revised" }],
    "addFlows": [{ "fromItemId": "new-step", "toItemId": "existing-node" }]
  }
}
```

`removeNodeIds` and `removeEdgeIds` are layout-only removals. They never delete
the referenced Task, Habit, or Project. Any node/Connection removal, more than
one removal, more than ten total changes, or more than five added Connections
requires a user-confirmed `destructiveConfirmation: true` marker. The marker is
checked server-side; a prompt instruction alone is not sufficient.

The patch receipt includes added, updated, and removed node/Connection IDs,
linked/created domain IDs, counts, warnings, and the same structured-plus-text
JSON result shape as build. `status: "replayed"` and `replayed: true` identify a
safe request-ID replay.

### Visual writes and flow conversion

- `import_visual` accepts an explicit base64/byte payload, a public HTTPS URL,
  or an already authorized asset handle. It can create one image node. A
  replacement always creates an immutable new asset version and requires
  `confirmed: true`.
- `update_visual` changes node/asset metadata, version-bound annotations, or a
  confirmed replacement. It never overwrites source bytes.
- `create_visual_relation`, `update_visual_relation`,
  `list_visual_relations`, and `delete_visual_relation` manage typed
  `reference`, `supports`, `evidence-for`, and `derived-from` context links.
  They are separate from canvas Connections and never execute work.
- `delete_visual_asset` requires explicit confirmation and soft-deletes the
  asset; `restore_visual_asset` restores its immutable versions and node
  references.
- `draft_visual_to_flow` only stores a pending Step/Decision/Connection
  proposal. The user must inspect and confirm with `confirm_visual_flow`; a
  rejection changes no native workflow. A source-version change makes the
  draft stale. Confirmed writes use the existing Domain Command adapters and
  retain `derived-from` provenance.

Visual assets are stored by the Kagelin process itself: image bytes live in the
local assets directory and metadata lives in the `visual_assets` SQLite table.
A local MCP process opens the same SQLite database in WAL mode, so Visual tools
read assets whether or not the Kagelin window is open; no browser pairing or
bridge is involved. Image bytes are still not inlined into snapshots: a client
calls `inspect_visual` with an explicit node/asset/resource ID. If Workspace
command adapters are unavailable in the current process, flow writes fail with
a machine-readable `visualCode: "bridge_unavailable"` error instead of falling
back to fabricated image bytes.

## Errors and retry

Failed calls have `isError: true` and a stable JSON error object:

```json
{
  "success": false,
  "contractVersion": "1.2.0",
  "error": {
    "category": "authentication | authorization | invalid_input | invalid_reference | confirmation_required | request_conflict | execution | compensation | unsupported_operation",
    "message": "safe human-readable summary",
    "details": {}
  }
}
```

The server fails closed without an explicit Account identity in real mode. It
does not sign in or register a default tester account. RLS remains defense in
depth; the adapter also checks Workspace, node, Connection, and referenced
Task/Habit/Project ownership before mutation.

`requestId` replay is limited to the lifetime of one local MCP process. A same
ID with a different canonical operation or input returns
`request_conflict`. A failed build is compensated for its newly created
Workspace and entities where the Domain Command contracts permit it. An
incomplete compensation is reported as `category: "compensation"` with
`status: "partial"` and retained identifiers; it is never reported as clean
success.
