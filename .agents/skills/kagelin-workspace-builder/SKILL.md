---
name: kagelin-workspace-builder
description: Use for requests to create or modify a Kagelin Workspace, Canvas, Flowchart, Blueprint, visual workflow, or stage/group layout. Do not use for standalone Task, Habit, Calendar, or Focus management.
metadata:
  version: 1.0.0
  requires_mcp_contract: ">=1.1.0 <2.0.0"
---

# Kagelin Workspace Builder

This Skill is the workflow layer for Workspace work. The five Kagelin Workspace
MCP tools are the capability and safety boundary: they validate inputs and
ownership, enforce confirmation and retry rules, execute the Blueprint Engine
through Domain Commands, and return operation receipts. Use the tools; do not
write database rows or invent a second persistence path.

Read the contract and domain references only when their detail is needed:

- MCP inputs, receipts, errors, and compatibility aliases:
  `mcp-server/instructions.md`
- Workspace node semantics and persistence rules:
  `docs/agents/workspace-node-specification.md`
- Layer ownership and version compatibility:
  `docs/agents/workspace-ai-contract.md`

## Route the request

Activate for Workspace, Canvas, Flowchart, Blueprint, visual workflow, stage,
group-layout, or conversational Workspace-patch requests. Route unrelated
Task, Habit, Calendar, and Focus requests to their normal capabilities.

Classify the active request as one of these paths before calling a mutating
tool:

- **Create**: the user wants a new Workspace or a new canvas arrangement.
- **Patch**: the user names, implies, or selects an existing Workspace to
  change.
- **Clarify**: the target, requested change, or a consequential missing choice
  is genuinely ambiguous.

Ask only focused questions that unblock the selected path. A clear request
should proceed without a confirmation or design questionnaire. If several
existing Workspaces could be the target, list them and ask the user to choose
an explicit ID; do not guess from a similar name.

## Create a new Workspace

1. Extract the requested name, visual structure, domain references, and any
   explicit node fields. Derive the relevant context query and entity kinds.
2. Before building when reuse or domain references could matter, call
   `inspect_app_context` with a bounded `query`, `entityKind`/`entityKinds`,
   and `limit`. Match the returned live IDs to the user's intent. Prefer an
   existing Task, Habit, or Project ID over creating a duplicate; never treat a
   name match as permission to reuse an unrelated record.
3. Choose the representation:
   - Use `mermaid` for a concise, topology-first graph or flowchart request.
   - Use canonical `{ blueprint }` for detailed fields, explicit entity IDs,
     groups, or structured layout intent.
   - If Mermaid cannot express a required semantic field or supported kind,
     ask the smallest clarification or fall back to a canonical Blueprint.
4. Advertise and send only v1-supported kinds: `doc`, `task`, `habit`,
   `project`, `focus`, `decision`, and `step`, with visual groups and visual
   Connections. Event nodes are outside this contract. Connections describe
   canvas relationships only; they do not schedule, trigger, evaluate, run,
   or propagate work.
5. Call `build_workspace` with the canonical object (or Mermaid input) and a
   stable `requestId` when the client can retry. Building creates a new
   Workspace; it is not the operation for changing an existing one.
6. Treat the returned receipt as the source of truth. Report the Workspace ID,
   `itemNodeIds`, linked/created entity IDs, counts, warnings, and whether the
   operation was replayed. A tool error is not a successful build.
7. Conditionally call `get_workspace_blueprint` after a topology/group build,
   warnings, complex entity reuse, or a result that cannot establish the
   requested structure unambiguously. A simple, warning-free receipt can be
   reported directly. If verification disagrees with the receipt, report the
   discrepancy rather than silently repairing it.

The normal creation sequence is:

`inspect_app_context` (when relevant) → `build_workspace` → optional
`get_workspace_blueprint`.

## Patch an existing Workspace

1. Call `list_workspaces` to resolve the target. Use an explicit Workspace ID
   from the user or their selection. Ask when the target remains ambiguous.
2. Call `get_workspace_blueprint` before composing a patch. Use its current
   node, Connection, group, position, size, and semantic-reference IDs. Keep
   untouched layout and entity references unchanged.
3. Build the smallest canonical `{ patch }` containing only requested
   additions, in-place Document/Decision/Step edits, visual Connections, or
   removals. Use `patch_workspace`; never express a local change as a full
   `build_workspace`.
4. For node/Connection removals or a materially broad batch, explain the
   concrete affected IDs and ask for the user's confirmation. Only after that
   confirmation send `destructiveConfirmation: true`. A prompt instruction is
   not a substitute for the MCP server's gate.
5. Call `patch_workspace` with a stable `requestId` when retrying is possible.
   Consume its receipt and report added, updated, removed, linked, created,
   and warned IDs honestly.
6. Re-read with `get_workspace_blueprint` after topology changes, removals,
   broad batches, warnings, or any result whose effect is not unambiguous.

The normal modification sequence is:

`list_workspaces` → `get_workspace_blueprint` → `patch_workspace` → optional
`get_workspace_blueprint`.

## Handle tool results

- `authentication` or `authorization`: stop the mutation path and explain
  that the MCP process needs the intended Account identity/session. Do not
  retry with another Account or expose data from a different one.
- `invalid_input` or `invalid_reference`: correct the blueprint/patch or ask
  for the missing target. The rejected call made no intended mutation.
- `unsupported_operation`: explain the supported v1 boundary and ask for a
  supported representation. Do not present an event node or runtime behavior
  as partially completed.
- `confirmation_required`: show the specific removal/batch and wait for
  confirmation before retrying with the explicit marker.
- `request_conflict`: preserve the original request ID for an actual retry;
  use a new ID only when the user intentionally asks for a different
  operation or input.
- `execution`: report that the operation failed. Never convert an error into a
  success claim.
- `compensation` with `status: partial`: report the retained Workspace/entity
  identifiers and actionable warnings, and ask for recovery rather than
  starting a duplicate build.

The Skill owns sequencing, representation choice, clarification, confirmation
conversation, and conditional verification. The MCP server owns capability,
validation, account safety, Domain Command execution, data integrity, retry
replay, and compensation.
