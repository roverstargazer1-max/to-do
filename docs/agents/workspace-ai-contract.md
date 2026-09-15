# Workspace AI contract ownership and compatibility

This document records the boundary between the Workspace domain, the MCP
adapter, and the workflow Skill.

## Ownership

| Surface          | Canonical source                                                                                                  | Owns                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Workspace domain | [`workspace-node-specification.md`](workspace-node-specification.md) and ADR-0016/0018/0019/0020/0021/0022        | Node semantics, persistence rules, layout/group behavior, and visual Connection meaning                    |
| MCP contract     | [`mcp-server/instructions.md`](../../mcp-server/instructions.md) and the schemas/types under `src/lib/workspace/` | Tool inputs, outputs, errors, safety gates, retry behavior, and the five-tool transport surface            |
| Workflow Skill   | [`skills/kagelin-workspace-builder/SKILL.md`](../../skills/kagelin-workspace-builder/SKILL.md)                    | AI-facing trigger, create/patch sequencing, clarification, reuse, confirmation, and verification decisions |

The three surfaces link to one another; none is a copy of the complete content
of another. The MCP adapter and Skill do not replace the Workspace Blueprint
Engine or write database rows directly.

## Versions

| Surface                           | Version | Compatibility statement                                                                   |
| --------------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| MCP Server                        | `1.1.0` | Implements MCP Workspace contract `1.1.0`                                                 |
| MCP Workspace contract            | `1.1.0` | Keeps the five existing tools and accepts canonical object forms plus legacy flat aliases |
| `kagelin-workspace-builder` Skill | `1.0.0` | Requires MCP Workspace contract `>=1.1.0 <2.0.0`                                          |

The Skill version may change when orchestration changes without changing the
tool contract. A contract-major change requires a new compatibility statement.

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

## v1 boundary

The external contract supports `doc`, `task`, `habit`, `project`, `focus`,
`decision`, and `step` nodes, visual group containers, and visual Connections.
Event nodes are not part of the v1 MCP or Skill contract. Connections are
layout relationships only and do not promise triggers, scheduling,
evaluation, execution, or dependency propagation.
