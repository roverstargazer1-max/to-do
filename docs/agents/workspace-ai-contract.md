# Workspace AI contract ownership and compatibility

This document records the boundary between the Workspace domain, the MCP
adapter, and the workflow Skill.

## Ownership

| Surface          | Canonical source                                                                                                  | Owns                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Workspace domain | [`workspace-node-specification.md`](workspace-node-specification.md) and ADR-0016/0018/0019/0020/0021/0022        | Node semantics, persistence rules, layout/group behavior, and visual Connection meaning                      |
| MCP contract     | [`mcp-server/instructions.md`](../../mcp-server/instructions.md) and the schemas/types under `src/lib/workspace/` | Workspace and Visual tool inputs, outputs, errors, safety gates, retry behavior, and image-content transport |
| Workflow Skill   | [`skills/kagelin-workspace-builder/SKILL.md`](../../skills/kagelin-workspace-builder/SKILL.md)                    | AI-facing trigger, create/patch sequencing, clarification, reuse, confirmation, and verification decisions   |

The three surfaces link to one another; none is a copy of the complete content
of another. The MCP adapter and Skill do not replace the Workspace Blueprint
Engine or write database rows directly.

## Versions

| Surface                           | Version | Compatibility statement                                                                                 |
| --------------------------------- | ------- | ------------------------------------------------------------------------------------------------------- |
| MCP Server                        | `1.2.0` | Implements MCP Workspace/Visual contract `1.2.0`                                                        |
| MCP Workspace/Visual contract     | `1.2.0` | Keeps the original Workspace tools and adds explicit image/Visual tools; legacy aliases remain accepted |
| `kagelin-workspace-builder` Skill | `1.0.0` | Requires MCP Workspace/Visual contract `>=1.2.0 <2.0.0`                                                 |

The Skill version may change when orchestration changes without changing the
tool contract. A contract-major change requires a new compatibility statement.

### Transport

The contract version describes the tool surface, not how messages travel, so it
stays `1.2.0` while the transport changed (ADR-0024):

- The desktop app serves the endpoint over **Streamable HTTP**
  (`http://127.0.0.1:<port>/api/mcp`) with a per-install bearer token; POST
  requests may receive plain JSON or SSE streams, GET opens the server-to-client
  SSE channel, DELETE ends a session, and `Mcp-Session-Id` carries session
  identity.
- `npm run mcp:start` keeps the **stdio** transport for source-tree development.
- Both transports share one server factory, so receipts, `requestId`
  idempotency, legacy aliases, and destructive-operation confirmation behave
  identically. No tool, schema, error code, or compatibility statement changed.

## Canonical forms and compatibility

- `build_workspace({ blueprint: WorkspaceBlueprint })` is the canonical
  structured form. `{ mermaid: string }` is the supported topology-first form.
- `patch_workspace({ patch: BlueprintPatch })` is the canonical structured
  form. Top-level `name`, `sections`, `flows`, `workspaceId`, and other flat
  fields remain accepted only as migration aliases and are identified by a
  warning and `inputForm: "legacy"` in mutation results.
- Mutation results contain a structured operation receipt in
  `structuredContent` and the same JSON representation in the text content.
  Legacy build counts and patch `result` fields remain available during the
  migration period.
- `requestId` is process-local idempotency. Reusing it with the same operation
  and canonical input replays the receipt; a different operation or input is a
  `request_conflict` error. It is not persistent across process restarts.

## 1.2 Visual boundary

- `image` is one asset-backed Workspace node kind. The node stores a stable
  asset reference and display metadata; image bytes remain in the Visual asset
  adapter.
- `get_workspace_blueprint` returns lightweight image descriptors and never
  embeds image bytes. `inspect_visual` reads an explicitly targeted thumbnail,
  crop, or original and returns a standard MCP `image` content block when the
  client declares support.
- `import_visual` and `update_visual` validate bounded sources and keep asset
  versions immutable. Metadata, annotations, typed Visual relations, and
  lifecycle changes use the shared Visual Workspace Service.
- `draft_visual_to_flow` only writes a pending draft. `confirm_visual_flow`
  writes native Step/Decision/Connection rows through Domain Commands and keeps
  `derived-from` provenance; confirmation failures are compensated when the
  adapter supports rollback.
- Visual assets live in Kagelin's local storage: image bytes are files in the
  local assets directory and metadata rows live in the `visual_assets` SQLite
  table. A local MCP process opens the same database in WAL mode, so assets are
  readable whether or not the Kagelin window is open; no browser pairing or
  bridge is involved. An unavailable adapter returns a machine-readable
  execution error and never fabricates image data.

Text-only clients receive metadata and ready OCR/description/summary data with
`equivalentToImage: false`; they must not claim to have visually inspected the
original image.

## v1 boundary

The external contract supports `doc`, `task`, `habit`, `project`, `focus`,
`decision`, `step`, and the asset-backed `image` node, plus visual group
containers and visual Connections. Event nodes are not part of the v1 MCP or
Skill contract. Connections are layout relationships only; Visual relations
are typed context links. Neither promises triggers, scheduling, evaluation,
execution, or dependency propagation.
