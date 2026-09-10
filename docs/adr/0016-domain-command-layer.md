# Domain command layer: one write funnel, Task first

Every interactive state change gets a named command. A **Domain Command** —
`task.toggle`, `task.create`, … — is a plain async function that any caller can
execute (component, Workspace canvas, future agent or dispatch loop), and it
owns the whole write policy for that intent: the mutation-service call, the
optimistic update, the rollback, the cache invalidation, and (once the event
bus lands) publication of the resulting domain event. The `useXxxMutations`
hooks become thin wrappers with their component-facing signatures frozen; the
14 offline-resumable `mutationKey`s registered in `QueryProvider` are reused
verbatim as the commands' execution identity, so paused-mutation recovery
across reloads is unchanged.

Scope is Task only for the first tranche — all seven mutations, including the
hardest surface (toggle with recurrence expansion, undo, reorder, duplicate).
Habit, Project and Calendar-event follow incrementally behind the same
pattern. Focus is excluded: its domain logic already lives in `timerStore` +
`focusMutations` and is decided separately.

## Considered options

- **Commands as a hooks factory.** Rejected: hooks only run inside a React
  render tree. The target architecture (event → edge → command dispatch, an
  agent command surface) needs commands callable from non-React contexts; this
  shape would cap the architecture at the React boundary before the Edge
  Engine or any agent can exist.
- **Commands below the mutation services** (hooks keep the cache policy,
  commands add naming and events). Rejected: it leaves two copies of cache
  policy — the hooks' and whatever direct command callers need — so the
  Workspace consistency scenarios would hold by convention, not construction.
  This is the dual-mutation-path disease KRNL0 paid for (UI path vs CLI path
  with drifting semantics; the convergence refactor never landed). The second
  write path must not exist from day one.
- **Migrating all entities at once.** Rejected: big-bang convergence refactors
  stall — KRNL0's own lesson. Task has the hardest mutation surface, so
  proving the extraction there de-risks every follower. Mixed old/new state
  during migration is safe because each hook migration is verbatim code
  movement with the existing unit tests kept green.

## Consequences

- **Commands are a write funnel, never a data source.** Reads trust only the
  TanStack Query cache. Data still arrives through paths that will never be
  commands: guest→registered migration, backup restore, uhabits import,
  profile updates, the calendar sync engine, and server-side writes
  (triggers, edge functions, RPC). A projection must never replay a command
  log as data.
- **The five client-side bypass paths stay out of scope, deliberately.**
  Wrapping migration or restore would put the zero-regression guarantee at
  risk for no consistency-scenario gain.
- **Offline resumability is anchored on the existing mutationKeys.**
  `setMutationDefaults` rebinds `mutationFn` globally after a reload, so the
  rebound function must be the same command execution (parameterised by the
  query client). Non-React callers execute the identical registered logic —
  there is no parallel imperative implementation.
- **Event publication is part of the command contract**, but its transport is
  a separate decision (the event bus). Until that lands, commands are a pure
  funnel with a defined publication point and no speculative event code.
- **Naming:** commands are `entity.verb` (`task.toggle`, later
  `habit.checkIn`) — never a bare verb. A Domain Command is distinct from the
  cmdk **Command palette**; CONTEXT.md carries the disambiguation.
