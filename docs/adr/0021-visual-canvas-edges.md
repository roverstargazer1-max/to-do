# Canvas connections are a visual layer, explicitly without a runtime

A Workspace can now draw a **connection** between two of its nodes: one row
in `workspace_edges`, one line on the canvas, drawn from a card's right-hand
port into another card's left-hand one and cut with the Delete key.

ADR 0018 deferred edges with a rule attached: _"When edges land they arrive
with their own migration and ADR, either with a working dispatch loop or
explicitly labelled visual — nothing in between."_ This is the second case.
A connection says **"these two belong together"** and nothing else. It has
no trigger, no condition, no evaluation, no transitive inference, no
scheduling, and no code path that reads it other than the one that draws it.
The KRNL0 lesson ADR 0018 recorded — a spec'd-but-unbuilt edge layer is
worse than none, because the data model promises a runtime nobody
implemented — is answered by not promising one: there is no `on: complete`
column for a future reader to mistake for a working feature.

## The table

`workspace_edges`: `id`, `workspace_id` (FK → `workspaces`, `CASCADE`),
`user_id` (denormalised, the RLS convention), `source_node_id` +
`target_node_id` (both FK → `workspace_nodes`, `CASCADE`), `created_at`,
`updated_at`. One row per **ordered pair**: A → B is a different
relationship from B → A, and a `UNIQUE (source_node_id, target_node_id)`
means drawing either twice is a no-op rather than a duplicate. A `CHECK`
forbids a node connecting to itself.

**These are hard foreign keys, where the node's entity reference is
deliberately soft** (ADR 0018/0019). The asymmetry is the point: a node
points at a _domain_ row that lives elsewhere and may legitimately be gone —
that is the dismissable orphan, and its absence is information. An edge
points at two node rows of this very workspace, which is pure layout. A
connection whose endpoint has vanished has no meaning to preserve, so the
database enforces it and cascades, in both backends: Postgres by FK, the
guest IndexedDB store by the two filters its snapshot writes already run
(deleting a node drops the edges that touched it; deleting a workspace drops
its own).

**Nothing else is stored.** No handle ids — every kind's card exposes exactly
one port per side, so the direction alone resolves the endpoint. No label, no
style, no ordering, no metadata: a column that only a future feature would
read is exactly the "pretending" ADR 0018 warned about. When a real consumer
arrives (the Edge Engine, an agent), it arrives with its columns, its
migration, and its own decision.

## The write path

`edge.add` and `edge.remove`, Domain Commands in the ADR 0016 funnel, the
same shape as `node.add`/`node.remove`: write → invalidate the `edges` query
family → publish `edge.added` / `edge.removed` (ADR 0017). Both events carry
the edge reference, never a row. Nothing publishes on failure.

`edge.add` is the one arrangement write whose id arrives **from the caller**.
The canvas draws the connection the instant the user lets go — the layer-2
optimistic pattern ADR 0018 established for drags — and mints the id up
front so that the row it asks the store to write _is_ the edge on screen.
Without that, the confirmation would arrive under a different id and the line
would remount for a frame. On failure the command invalidates **before** it
rethrows: a refused write must not leave an optimistic line standing.

## The read path

`toWorkspaceFlowEdges` translates rows to React Flow edges, and **derives
orphan-ness at read** — the ADR 0019 rule applied to connections. An edge is
drawn only when both of its endpoints are in the node set currently on
screen. The two queries land independently, so for one render the node set
can already have lost an endpoint the edge set still lists; dropping it at
the read boundary means a line to a node that is no longer there cannot be
drawn, before any invalidation arrives.

## The interaction

Ports come from the shared `NodeCard`: one punched handle centred on each
side of every kind's card, so all five kinds connect identically and no kind
component knows connections exist. React Flow runs in **Strict** connection
mode, which normalises the direction: a drag from a left port onto a right
one produces the same A → B edge as the reverse, so the arrangement keeps
reading left → right whichever end the user grabbed. `isValidConnection`
refuses a self-loop and a pair that is already connected, so the store is
never asked to write something the schema would reject.

The Delete key is scoped to connections: nodes are `deletable: false`, and a
node leaves the canvas through its own remove control — `node.remove`, a
layout write with its own event and toast — never by a keystroke that would
only edit local React Flow state and desynchronise from the database.

## Ports are hidden from non-canvas renders

The connector handles render only when the card is hosted by React Flow:
`useNodeId()` returns null in a standalone render, and React Flow's `Handle`
throws without its store. That is what keeps every existing node component
test — which renders a node directly, with no canvas — structurally
unchanged. It is also the correct behaviour: a node component outside a
canvas has nothing to connect to.

## The backup boundary — a recorded gap

A connection is part of the canvas, and the guest backup carries the canvas —
yet `BackupData` gains **no** `workspace_edges` section. That is a deliberate
boundary, not an oversight: the WebDAV guest flow's workspace sections
(`workspaces`, `workspace_nodes`) are pinned by its own contract, and widening
them changes an export format, which is its own ticket with its own
migration-of-the-archive thinking. Shipping the section half-wired would be
precisely the "data model pretends, runtime doesn't" failure ADR 0018 was
written about.

The consequence is recorded rather than softened: **a guest who restores a
backup loses their connections.** `restoreBackup` keeps its two-argument
signature and writes the `edges` section as empty — overwrite-on-backup means
the canvas becomes what the archive carried, and the archive carried none.
Row-level safety nets still hold (nothing dangles, nothing renders a line to
a vanished node); what is lost is authored layout, visibly, the moment the
canvas returns. Adding the section is a small, self-contained follow-up.

## Considered options

- **A `node_links` column on `workspace_nodes` (an array of node ids).**
  Rejected: it cannot express an edge's own identity, so a `removed` fact
  could not name what was removed, and cutting one connection would rewrite
  the whole array — the same "re-serialise a blob per write" problem that
  kept guest nodes out of `mockStore` (ADR 0018).
- **Edges as a derived view (infer connections from shared project, due
  date, or ordering).** Rejected: an inferred connection cannot be cut, and
  a user who cuts one and sees it return has been lied to.
  Derivability is not authorship.
- **Deferring persistence, keeping connections in canvas-local state.**
  Rejected: a layout the user authored that evaporates on reload is worse
  than no connections, and it would put a second, non-durable arrangement
  layer beside the durable one.
- **Storing handle ids for future multi-port kinds.** Rejected as
  speculative — see "Nothing else is stored".
- **Loose connection mode (any port to any port).** Rejected: it permits
  target→target connections, which have no reading. Strict mode already
  gives free connection in both drag directions.

## Consequences

- **Cutting a connection is lossless for everything else**: both endpoints
  survive, their entities are untouched, and only the relationship goes
  away. Removing a node is the destructive direction, and it takes its
  connections with it — the honest meaning of "remove this node".
- **Undo of an entity delete revives nodes but not their connections.** A
  command-layer task delete removes the nodes referencing it (ADR 0019), and
  the connection rows cascade away with them; `task.restore` re-inserts the
  nodes it captured, not the edges. Accepted, and recorded here rather than
  discovered later: the alternative widens the shared cleanup helper whose
  contract the existing suite pins, and the loss is visible at the moment the
  node returns — one drag to redraw, the same drag that made it.
- **Connections are in no backup today** — see "The backup boundary" above.
  The cloud account export (`cloud-data.ts`) omits canvas layout entirely and
  stays as it is; the guest ZIP's workspace sections stay two-wide until their
  own ticket widens them.
- **Cross-device freshness matches the app baseline**: no realtime on
  `workspace_edges`, so a second device sees new connections on next fetch,
  exactly as it sees new nodes today.
- **When the Edge Engine arrives**, this ADR's label is what it has to
  replace: adding a trigger column and a dispatch loop is a new decision,
  and it should supersede this one explicitly rather than quietly widen a
  table that currently promises nothing.
