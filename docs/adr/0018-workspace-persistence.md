# Workspace persistence: two row-level tables, guest in IndexedDB, dropped on signup

A Workspace is persisted as two row-level tables, not a document:

- `workspaces` — `id`, `user_id`, `name`, `created_at`, `updated_at`.
- `workspace_nodes` — `id`, `workspace_id` (FK → `workspaces`, `ON DELETE
CASCADE` — the only hard FK), `user_id` (denormalised, the RLS convention),
  `node_kind` (text), `entity_type` + `entity_id` (nullable, `CHECK`-paired),
  `position_x` / `position_y`, `width` / `height` (nullable),
  `display_config` (jsonb, nullable), `created_at`, `updated_at`.

There is **no FK from `workspace_nodes` to any domain table**: a node is a
polymorphic soft reference (task / habit / event / focus), which a single
column cannot enforce in Postgres. Reference integrity is an application
concern, decided separately. `updated_at` is carried for last-write-wins
fallback on multi-device concurrent layout edits — the app-wide
single-user-single-writer assumption, matching how tasks and habits behave.

Edges are **not built, at all, in this phase** — no table, no UI, no visual
lines. The KRNL0 lesson is that a spec'd-but-unbuilt edge layer is worse than
none (their runtime dispatch was never implemented while the data model
pretended otherwise). When edges land they arrive with their own migration
and ADR, either with a working dispatch loop or explicitly labelled visual
— nothing in between.

The **viewport** (zoom / pan) is device-local, in its own persisted store,
never cloud-synced: node positions are authored layout and travel with the
account; which part of the canvas a given device is looking at does not.

## Guest storage

Guest workspace data lives in IndexedDB (`idb-keyval`, own key — the
`importSource.ts` precedent), **not** in the mockStore localStorage blob:
node writes are high-frequency, and the blob re-serialises in full on every
write against a ~5MB cap. The cloud/guest split stays the codebase's inline
`if (isGuest)` pattern inside each queryFn/mutationFn — a repository
abstraction is not introduced by this feature. This is additive discipline:
new code follows the established convention rather than reforming it.

## Considered options

- **Three tables (edges now).** Rejected: an edge table with no dispatch and
  no UI is speculative schema — the shape cannot even be validated, because
  what an edge needs to store depends on decisions the dispatch loop forces
  (cycle guards, args, enablement) that have not been made.
- **A single jsonb canvas document** (the KRNL0 `board.json` shape). Rejected:
  write amplification (every drag rewrites the whole canvas), TanStack Query
  cache granularity destroyed (one key, all-or-nothing invalidation), no
  row-level RLS, and multi-device edits tear the document.
- **Extending mockStore (`kanso_guest_data_v12`).** Rejected: puts drag-sized
  write frequency on a synchronous full-JSON re-serialisation path, and grows
  the strip/backup/migration surface of the guest blob for no gain.
- **A repository interface to unify cloud/guest.** Rejected as big-bang: it
  would have to touch all six existing domains to be honest, violating the
  zero-regression guarantee. Workspace follows the inline-split convention;
  unification, if ever, is its own decision.
- **Migrating guest workspaces on signup (with id remapping).** Rejected for
  phase 1: the remap maps exist, but wiring them in means modifying the
  migration path — the most fragile of the five client-side bypass paths,
  which ADR 0016 keeps out of scope. Guest workspaces are dropped on signup,
  the ADR 0014 calendar precedent: the domain data migrates, only the layout
  is lost, and the outcome is documented honestly. Remapping migration is a
  possible follow-up.
- **A note node (workspace-native text content).** Deferred: it would be the
  first workspace-owned business-ish content, amending the "nodes store
  reference metadata only" rule. Phase 1 ships reference nodes only; if notes
  are wanted, they come back as their own decision.

## Consequences

- **Schema lands twice** — `supabase/schema.sql` and a migration — per repo
  convention; RLS is `user_id = auth.uid()` on both tables. No realtime
  publication, so no REPLICA IDENTITY concern.
- **Unknown `node_kind` renders as a placeholder, never an error** — a stale
  canvas (older client, newer kind) must still render. Kinds are validated at
  the client boundary by a declarative registry; the column stays tolerant
  text.
- **Drag writes are three-layered**: during drag, React Flow local state only;
  on drag end, optimistic `setQueryData`; then a debounced (300–500ms)
  row-level PATCH under a position-specific mutation key — debounce happens
  _before_ the mutation, so offline queuing accumulates at most one paused
  position write per node.
- **Workspace joins the Backup surface**: `BackupData` grows two sections,
  `RESTORE_ORDER` and the restore-time invalidation prefix lists are extended,
  and `GUEST_QUERY_KEYS` registers the workspace prefixes — a Guest's Workspace
  is part of their dataset and travels in the Backup ZIP, since Backup is the
  only off-device path a Guest has.
- **"Start fresh" clears the guest workspace** — it is guest data, and a
  partial clear would leave nodes referencing nothing.
- **No demo workspace**: an empty canvas on first open. Demo-ness and its
  ADR 0014 cascade stay untouched by this feature.
- **Layout writes are born as commands** (`node.add`, `node.move`,
  `workspace.create`): the command layer has no second write path from day
  one. They publish Node events, not Domain Events.
- **Cross-device layout freshness matches the app baseline**: no realtime on
  workspace tables; a second device sees the new arrangement on next fetch,
  exactly as it sees new tasks today.
