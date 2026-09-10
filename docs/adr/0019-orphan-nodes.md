# Orphan nodes: detected at read, cleaned by commands, never by the database

A node whose target entity no longer exists — an **orphan** — is not a stored
state. Orphan-ness is derived at read time: the node renders its entity
through the same per-entity Query the normal UI uses, and a confirmed miss
renders an orphan placeholder offering **dismiss** (which is `node.remove`,
an ordinary workspace command). There is no cascade trigger and no tombstone
column.

Domain delete commands that run through the command layer (`task.delete`,
clear-completed, project hard-delete) additionally remove the nodes
referencing what they deleted, across the user's workspaces, and place the
removed node rows in their **Undo context** — so an undone delete re-inserts
the nodes along with the task subtree, exactly the pattern
`taskMutations.delete` already uses for cascaded subtasks (fetched before the
delete, returned to the caller, re-inserted by `restore`). A user never loses
canvas layout to an action they can undo.

## Considered options

- **A database trigger cascading node deletion.** Rejected: the trigger acts
  server-side and irreversibly, while task deletion is client-undoable —
  Undo would restore the task but not the nodes, and the client could not
  even know which rows the trigger removed across workspaces. Worse, a Guest
  has no Postgres, so the policy would need a second client-side
  implementation for guest mode: one policy, two code paths — the dual-path
  disease this project refuses (ADR 0016).
- **A tombstone / `is_orphan` column.** Rejected: it persists a derived state
  (violating derive-at-read), still requires someone to write it on every
  entity delete (the same trigger/dual-implementation problem), and buys
  nothing — the placeholder the user sees is render state, not row state.

## Consequences

- **Cross-device deletion needs no propagation.** A task deleted on another
  device surfaces locally when the entity query refetches and misses — the
  node turns into a placeholder. Workspace staleness equals the app-wide
  staleness baseline; no realtime is introduced (the ADR 0017 stance).
- **Deletions outside the command layer leave dismissable placeholders**:
  Backup restore's stale-row pruning, the calendar sync engine, and other
  devices' bulk actions. Rare and visible, never silent garbage.
- **Phase 1 asymmetry**: only Task delete commands carry node cleanup (the
  D1 scope). Habit and event deletions produce placeholders until their
  command migration adds the shared cleanup helper — accepted interim
  behaviour, not a permanent split.
- **Orphans revive for free.** If the entity returns — an undone delete, a
  Backup restore that brings the row back — the next entity fetch revives
  the node without any reconciliation code.
- **Dismiss is the only orphan affordance in phase 1.** Re-linking a node to
  a different entity is a later-phase decision (entity picker UI plus
  `entity_id` mutation semantics); the placeholder states plainly what was
  lost.
- Terminology: an Orphan is distinct from the Calendar-connection
  **Tombstone** (a locally-deleted synced event awaiting remote push) —
  CONTEXT.md carries the disambiguation.
