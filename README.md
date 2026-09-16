<p align="center">
  <a href="https://kagelin.app">
    <img src="public/kagelin-icon.png" width="80" alt="Kagelin" />
  </a>
</p>

<div align="center">

# Kagelin

## Work quietly. Own everything

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

## Use it

**[app.kagelin.app](https://app.kagelin.app)** — installable as a PWA, works fully offline in guest mode. No account needed.

_Currently in preview — expect rough edges._

</div>

## Screenshots

<p align="center">
  <img src="public/screenshots/board-view-desktop.webp" alt="Board view" width="47%" />
  &nbsp;
  <img src="public/screenshots/habit-grid-desktop.webp" alt="Habit grid" width="47%" />
</p>
<p align="center">
  <img src="public/screenshots/timer-with-task.webp" alt="Focus timer" width="47%" />
  &nbsp;
  <img src="public/screenshots/calendar-monthly.webp" alt="Calendar monthly view" width="47%" />
</p>
<p align="center">
  <img src="public/screenshots/command-pallete-desktop.webp" alt="Command palette" width="70%" /><br />
  <sub>Command palette (Ctrl/Cmd+K)</sub>
</p>

## Why Kagelin

Most productivity apps want your email before you've written a single task, and keep your data on their servers either way. Kagelin doesn't.

- **Nothing to sign up for.** Tasks, habits, focus, and calendar — all offline in guest mode. Account only if you want cloud sync.
- **Your data, your server.** Guest mode keeps everything on your device, and backs up to your own Nextcloud, Synology, or any WebDAV server. No middleman.
- **Take everything with you.** Encrypted ZIP export, full data deletion, and standard `.ics` files. Leaving is always an option.

## Features

### Tasks & Organization

- **Search** (`Ctrl/Cmd+K`): instant search across tasks, habits, and events, plus navigation and actions.
- **Task views**: Board and List view with 2D keyboard navigation.
- **Vim navigation & task controls**: `gg`/`G` navigation, `yy` yank, `p` paste, and `u` undo.
- **Split View**: Desktop List opens a master-detail panel automatically.
- **Projects**: multi-level project structure with archiving and mobile drawers.
- **Group & Filter**: group by project, priority, or due date with drag-and-drop across groups.
- **Recurring tasks**: per-task Strict (anchors to due date) or Flexible (anchors to completion) recurrence.
- **Notes editor**: markdown formatting toolbar with live preview for task notes.

### Workspaces & Visual Workflows

- **Named workspaces**: create multiple canvases from the Workspaces section in the sidebar, the command palette, or `W`; rename, recolor, and delete them independently.
- **Live references**: place existing tasks, habits, calendar events, and projects on a canvas. Task completion, habit check-ins, and project progress stay connected to the underlying domain data. Removing a card removes only its workspace node, never the referenced task, habit, event, or project. Calendar event cards are display-only.
- **Native planning cards**: add Markdown Docs, Decisions, Steps, and Focus cards. Docs support edit/preview and one-click Markdown copy; Decision and Step cards can be edited inline; Focus cards control the shared Pomodoro timer.
- **Groups and layout**: select cards and group them into phases or swimlanes, rename/resize/ungroup containers, drag cards, resize cards, pan and zoom, and fit the whole canvas. Node positions and sizes persist; the viewport is restored on the current device.
- **Connections**: connect a node's right output to another node's left input, add or edit labels, and remove links from the midpoint control or `Delete`. Connections are visual layout relationships only: they do not trigger events, schedule work, execute commands, or propagate runtime dependencies.
- **Safe degradation**: if a referenced domain entity is deleted elsewhere, the canvas keeps the node position and shows an orphan placeholder that can be dismissed without affecting other data. Unknown node kinds also degrade to a removable placeholder for forward compatibility.

For the full node and topology reference, see [`docs/agents/workspace-node-specification.md`](docs/agents/workspace-node-specification.md). User-oriented workspace examples are collected in [`docs/USER_WORKSPACE_GUIDE.md`](docs/USER_WORKSPACE_GUIDE.md).

### Focus & Habits

- **Focus Timer**: PiP-enabled Pomodoro engine that hands off between your devices, so pausing on one pauses on all of them.
- **Push notifications**: server-derived Web Push notifications for timer completions and task reminders (supporting desktop, Android, and iOS standalone PWA).
- **Habit tracking**: standardized tracking with longevity streaks and uhabits `.db` import.
- **Compact habit view**: tappable rolling-7 day strip with drag-and-drop reordering.
- **Activity heatmap**: visualize focus minutes and habit completions over time.

### Calendar

- **Flexible views**: Month, desktop 4-day, mobile week view with edge-gated paging, and rolling 3-day view.
- **Event creation**: quick event creation with natural language time parsing.
- **Multi-provider sync**: Google Calendar and Microsoft Outlook.
- **ICS portability**: universal `.ics` (RFC 5545) import and export.

### Data Ownership

- **Guest Mode**: full-featured, zero-footprint experience in `localStorage` — no account needed.
- **Accounts & Auth**: Google, GitHub, or breach-checked email/password sign-in with multi-provider identity linking and password reset.
- **WebDAV backup**: keep a copy of everything on a server you own (Nextcloud, Synology). Available at every tier, account or not. It is a backup, not a sync: each upload replaces the last.
- **Backups & Portability**: encrypted `.zip` export/import, guest backup reminders, and instant cloud data wipe.
- **Offline-first PWA**: full offline support via service worker with stale-while-revalidate caching.
- **Telemetry**: off by default for everyone, Guest Mode included. If you opt in, we collect anonymous product-usage counts (no task titles, habit names, or other content) tied to a random device ID, never your account.

### Stats & Insights

- **Stats page**: period selector, breakdowns by project and priority, time-of-day heatmap.
- **Item insights**: per-habit and per-recurring-task stats — score history, streaks, frequency, on-time rate.
- **Goal tracking**: progress rings on habit cards, global focus and task goals.
- **Export**: analytics CSV and JSON from stats and insights panels.

### Preferences

- **Time format**: system-wide 12h/24h toggle across all time displays.
- **Keyboard accessible**: Esc closes all modals, full focus-trap and `aria-modal` compliance.
- **Haptic feedback**: standardized haptic palette for precise mobile feedback.

## Shortcuts

| Shortcut            | Action                                                            |
| ------------------- | ----------------------------------------------------------------- |
| `1–6`               | Quick navigation (Home, Habits, Calendar, Stats, Focus, Settings) |
| `Shift+1 / 2`       | Switch view (Board / List)                                        |
| `gg / G`            | Jump to top / bottom of task list or board                        |
| `yy / p / u`        | Yank task / paste task / undo action                              |
| `Ctrl/Cmd+K`        | Open Command Palette                                              |
| `Ctrl/Cmd+B`        | Toggle Sidebar                                                    |
| `N / H / E / P / W` | Create new (Task, Habit, Event, Project, Workspace)               |
| `Shift+H`           | View all shortcuts                                                |

## AI-assisted Workspaces (MCP + Skill)

Kagelin separates the AI integration into two layers:

- **MCP server** (`mcp-server/`) provides the capabilities and safety boundary. It exposes exactly five tools: `list_workspaces`, `inspect_app_context`, `get_workspace_blueprint`, `build_workspace`, and `patch_workspace`.
- **Skill** (`skills/kagelin-workspace-builder/SKILL.md`) is the optional workflow layer. It decides when to inspect context, reuse existing entities, ask for clarification, choose Blueprint versus Mermaid, request confirmation, consume receipts, and verify the result. It does not write data directly.

The current contract versions are MCP `1.1.0` and Skill `1.0.0`. The v1 AI contract supports `doc`, `task`, `habit`, `project`, `focus`, `decision`, and `step` nodes. Native Workspaces can display calendar event nodes, but MCP/Skill v1 intentionally rejects `event` nodes. Connections remain visual-only and have no runtime automation semantics.

### Configure the MCP server

1. Install the project dependencies and create the local environment file:

   ```bash
   npm install
   cp .env.example .env.local
   ```

2. Configure the Supabase project and the Account identity used by the MCP process. A standalone stdio server needs either a session-bound Supabase client supplied by an embedding host or the server-side secret key. For the local `npm run mcp:start` process, use:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_SECRET_KEY=<server-only-secret-key>
   KAGELIN_MCP_USER_ID=<authenticated-account-uuid>
   ```

   `KAGELIN_MCP_USER_ID` is the explicit Account scope, not a password. The secret key must stay in the local server environment and must never be exposed to browser code, committed to Git, or placed in a public deployment. The adapter still checks Workspace, node, Connection, and referenced domain-entity ownership before mutation. Real mode fails closed without an explicit identity; `KAGELIN_MOCK_MODE=true` is for tests and local fixtures only.

3. Start the server once to verify the stdio process:

   ```bash
   npm run mcp:start
   ```

   MCP clients start this process themselves after it is registered. Do not run the command as a long-lived HTTP service; this integration uses stdio.

#### Example stdio client configuration

Use the equivalent MCP server entry in Antigravity, Claude Desktop, Claude Code, Cursor, or another stdio-capable client. Replace the placeholders with absolute paths and local credentials:

```json
{
  "mcpServers": {
    "kagelin-workspace-builder": {
      "command": "node",
      "args": [
        "<path-to-kagelin>/node_modules/tsx/dist/cli.mjs",
        "--tsconfig",
        "<path-to-kagelin>/tsconfig.json",
        "<path-to-kagelin>/mcp-server/index.ts"
      ],
      "env": {
        "NEXT_PUBLIC_SUPABASE_URL": "https://<project>.supabase.co",
        "SUPABASE_SECRET_KEY": "<server-only-secret-key>",
        "KAGELIN_MCP_USER_ID": "<authenticated-account-uuid>"
      }
    }
  }
}
```

The server also loads a repository `.env.local` when started through `mcp-server/index.ts`, so the secret can remain there instead of being duplicated in a client configuration file. See [`mcp-server/README.md`](mcp-server/README.md) for client-specific templates and [`mcp-server/instructions.md`](mcp-server/instructions.md) for the complete tool contract.

### Configure and use the Skill

1. In a Skill-capable client, install or map the canonical file [`skills/kagelin-workspace-builder/SKILL.md`](skills/kagelin-workspace-builder/SKILL.md) under the name `kagelin-workspace-builder`. Client-specific copies are not maintained; keep the canonical file and MCP contract versions together.
2. Connect the same client to the MCP server above. The Skill supplies sequencing and conversation guidance; the MCP server remains responsible for validation, Account scoping, destructive-operation gates, receipts, retries, and data integrity.
3. Ask for a new canvas in terms of its goal, stages, cards, and relationships. For example: “Create a Workspace called Release flow with Prepare, Build, and Verify stages; reuse my existing release task and connect the stages left to right.” The Skill may inspect relevant projects, habits, and tasks, then calls `build_workspace` and reports the receipt.
4. Ask for an existing-canvas change with an explicit target and a localized request. For example: “In the Release flow Workspace, add a Verify step inside the Build group and keep every existing card in place.” The Skill lists Workspaces, reads the target snapshot, calls `patch_workspace`, and re-reads after topology or removal changes. It never turns a local edit into a full rebuild.
5. Confirm destructive changes when requested. Removing nodes or Connections, or sending a broad patch, requires `destructiveConfirmation: true` at the MCP boundary. Use a stable `requestId` when a client may retry: an identical retry is replayed safely, while a reused ID with different input returns a conflict.

If the client cannot load Skills, request the named MCP prompt `workspace_builder_workflow` and follow its compact inspect → resolve → build/patch → receipt → verify sequence. For generic clients, use `list_workspaces` to resolve an existing target, `inspect_app_context` when choosing live references, `get_workspace_blueprint` before a patch, and then `build_workspace` or `patch_workspace` as appropriate.

<details>
<summary><strong>Stack</strong></summary>

- **Next.js 16.2.10** (App Router) + **React 19.2.7** (React Compiler)
- **Supabase** (Postgres, Auth, Realtime)
- **TanStack Query v5** (IndexedDB persistence) + **Zustand v5**
- **Tailwind CSS v4** + **Shadcn UI** (Radix)
- **Framer Motion** + **@dnd-kit** (flat-DOM drag-and-drop)
- **Serwist** (typed service worker, offline-first PWA)
- **tsdav** (CalDAV, currently deferred) + **ical.js** (ICS import/export)

</details>

## Setup

**Prerequisites**: Node.js 20+, a Supabase project with the schema from `supabase/schema.sql` and relevant migrations from `supabase/migrations`.

```bash
git clone https://github.com/roverstargazer1-max/to-do.git
npm install
cp .env.example .env.local   # add all relevant keys
npm run dev
```

## Contributing & Feedback

Bug reports and feature requests go in [GitHub Issues](../../issues). For questions and discussion, use [GitHub Discussions](../../discussions).

## License

[AGPL-3.0](LICENSE)
