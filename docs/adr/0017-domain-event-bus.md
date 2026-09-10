# In-memory domain event bus, command-published, no cross-device propagation

Domain Commands publish **Domain Events** — past-tense named facts about one
entity (`task.completed`) — over a typed, module-level, in-memory bus
(`src/lib/events/`). The bus is a synchronous emitter with a discriminated-union
event type; it is published to exclusively by Domain Commands after their write
lands, and it carries an entity reference plus at most a minimal change
summary — never a full row. In phase 1 its only consumers are test assertions;
production consumers (Edge Engine, agents, later analytics) arrive in later
phases.

The bus deliberately does **not** take over anything invalidation already does.
Two channels with different jobs:

- **Data freshness** — optimistic writes + `invalidateQueries`, unchanged, now
  owned by commands. Covers every write path, including ones that are not
  commands (restore, migration, imports, the calendar sync engine,
  server-side triggers), because all of those end in invalidation.
- **Semantic observation** — Domain Events, command-published only. Says what
  the user did, which the freshness channel cannot: a backup restore and a
  checkbox toggle produce indistinguishable cache churn but are opposites as
  intents.

## Considered options

- **`window` CustomEvents as the bus** (existing precedent: `timer-complete`,
  `kagelin:telemetry-consent`). Rejected: stringly-typed, no compile-time
  contract for consumers, global namespace. The Edge Engine and agent surface
  will bind to event names as a trigger contract — that contract must be
  type-checked.
- **Deriving events from `QueryCache.subscribe`** (the survey report's
  suggestion). Rejected as the semantic channel: cache events fire on
  refetches, restores, and migrations alike, cannot name an intent, and carry
  no entity-level identity. Adequate for "data changed, repaint" — which
  invalidation already covers — useless for "task.completed → start focus".
- **Cross-tab propagation via `BroadcastChannel`**. Rejected for phase 1: all
  four consistency scenarios are same-tab; the whole app today has zero
  cross-tab consistency (each tab holds an independent Query cache), so a
  Workspace matching that baseline is consistent, not deficient. A
  BroadcastChannel invalidation bridge can be proposed later as an app-wide
  enhancement with its own decision.
- **Cross-device propagation via Supabase Realtime.** Rejected: realtime
  cross-device mirroring is an unbuilt **premium** capability.Routing domain
  events over Realtime would build it through the back door and break the tier
  boundary. The timer channel (`useTimerSync`) stays the only cross-device
  realtime path — it is Timer handoff, not mirroring.
- **Migrating `trackTelemetry` to the bus as the first production consumer.**
  Rejected for phase 1: it risks the zero-regression guarantee (telemetry has
  its own consent plumbing) for no consistency-scenario gain. The bus earns a
  production consumer when the Edge Engine lands.

## Consequences

- **Guest mode needs no degradation path.** The bus is in-memory with no
  transport and no auth: identical behavior for Guest, Registered, and
  Premium. Tier differences only exist for cross-device propagation, which we
  are not building.
- **Bypass writes publish no events, by design.** Backup restore, signup
  migration, imports, the calendar sync engine and server-side triggers
  invalidate caches but emit nothing — they are not user intents. Anything
  that needs to react to _data_ rather than _intents_ must subscribe to
  invalidation, not the bus.
- **Event names are the trigger contract.** Past-tense, one name per outcome
  (`task.completed` and `task.uncompleted`, never `task.toggle` + a flag):
  future edges bind to names, so the name must be the outcome. Commands are
  `entity.verb`; events are `entity.pastTense`.
- **Offline-paused commands publish on resume.** A command that sat paused and
  completes after a reload publishes its event then; the event's timestamp
  reflects when the change landed, not when the intent formed. Accepted: an
  event is a fact about landed state.
- **The KRNL0 lesson is answered by scale.** Their edge dispatch was specified
  and never built; here the bus is ~40 lines plus types, exercised by unit
  tests, with no consumer promised before it exists. The dispatch loop itself
  remains a later phase that will not be advertised before it ships.
- **A Task-domain query-key factory lands with the command migration**:
  existing key shapes wrapped verbatim (a reshape breaks every consumer at
  once), commands and new Workspace queries must use it, and full-repo
  centralization stays a slow follow-up — not this feature's deliverable.
