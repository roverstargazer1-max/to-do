# Focus nodes project the timer singleton; the timer stays out of the command layer

A focus node (`node_kind = 'focus'`, no entity reference — the D3 schema's
nullable pair) is a **projection of the timer singleton**, not a second
timer. The single source of truth is unchanged from ADR 0002: `timerStore`
(Zustand) in-tab, `user_timer_state` as the cross-device arbiter. The node
subscribes to the store with a selector; its countdown derives from the
server-anchored `ends_at` + `serverClock` exactly as every existing timer
surface does. Its start/pause/stop actions call the **same** `useFocusTimer`
actions the Focus page calls — `TimerProvider` sits above `AppShell`
(`app/layout.tsx`), so every Workspace route is inside its context and no
second write path is even constructible.

Timer **history** is a different projection and a different source: completed
sessions read the `focus_logs` queries. A focus node shows the live timer,
never past sessions.

The timer is deliberately **not command-ified** in this phase: no
`timer.start` command, no `timer.*` Domain Events, and the internal
`timer-complete` window CustomEvent stays internal plumbing. Timer commands
arrive as their own decision if the Edge Engine ever needs timer triggers —
a real consumer, which is the only justification for touching the most
delicate concurrency code in the app.

## Considered options

- **Moving timer running state into the Query cache** (treating it as domain
  data like tasks). Rejected: it rewrites ADR 0002's handoff machinery —
  reconcile, claim-based completion, echo prevention — for zero
  consistency-scenario gain. The timer is a bounded singleton, not a
  collection; it already has the state model it needs.
- **Command-wrapping the timer now and publishing timer events.** Rejected:
  infrastructure with no consumer, touching race-sensitive code for
  architectural uniformity — and remote-origin writes (`useTimerSync` →
  `setState` directly) would never emit local events anyway, so
  cross-device edge triggering would silently not work while appearing
  supported. KRNL0's pomo desync between its two write paths is the mirror
  lesson: the fix is one store and one action funnel, which already exists.

## Consequences

- **Scenarios 3 and 4 hold by construction**: one store, one action funnel;
  in-tab immediately, cross-device via Timer handoff (registered users).
  Guest needs no degradation — `timerStore` is local.
- **The command layer carries a documented exception**: focus writes bypass
  commands. This is the "decided separately" carve-out ADR 0016 recorded.
- Multiple focus nodes on one canvas are allowed and harmless — they are
  lenses on the same singleton, like two clocks showing one time.
- When timer commands one day land (Edge Engine triggers), remote-origin
  writes still won't emit local events — a tab hears only its own commands
  (ADR 0017). Cross-device timer triggering would then be premium mirroring
  territory, decided then, not now.
- `timer-complete` remains an internal window event consumed by
  `useFocusTimer`; it is not a Domain Event and must not be counted as one.
