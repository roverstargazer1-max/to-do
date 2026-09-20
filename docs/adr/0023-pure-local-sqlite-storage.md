# ADR 0023: Pure local SQLite storage: one database file, WAL concurrency, no Docker or browser sandboxing

## Context

Kagelin previously maintained a split persistence architecture:

1. **Guest Mode**: All user data resided in the browser/Chromium sandbox (`localStorage` for tasks/habits, `idb-keyval` IndexedDB for canvas nodes/edges and import sources). This sandbox isolated data by origin (`127.0.0.1:<port>`), meaning random ports lost data, and external CLI tools, scripts, or AI agents could not read or write user data directly. For the MCP server to access guest assets, it required a reverse long-polling HTTP bridge (`guest-bridge-host.ts`) back into an active browser window.
2. **Cloud/Docker Mode**: Required local Supabase infrastructure (PostgreSQL, Kong, GoTrue, PostgREST) running inside Docker containers, imposing substantial overhead for a personal productivity tool.

To establish Kagelin as a true local-first, standalone desktop software (comparable to Obsidian or Things 3), all user data must be unified into a transparent, accessible, single local SQLite database file on the host filesystem (`%APPDATA%\Kagelin\data.db`).

## Decision

1. **Local SQLite File Storage**:
   - Replace IndexedDB, `localStorage` mock stores, and cloud Supabase with a local SQLite database powered by `better-sqlite3`.
   - Default production path: `%APPDATA%\Kagelin\data.db` (macOS/Linux: system standard application data directories).
   - Default development path: `.scratch/data.dev.db`.
   - Override path: configurable via `process.env.KAGELIN_DB_PATH`.

2. **WAL Mode & Concurrency Configuration**:
   - Every SQLite connection enables Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) and a busy timeout (`PRAGMA busy_timeout = 5000;`).
   - Normal synchronization (`PRAGMA synchronous = NORMAL;`) ensures high performance with robust crash resilience.
   - Foreign key constraints are strictly enforced (`PRAGMA foreign_keys = ON;`).
   - Multiple separate processes (Kagelin desktop client, external AI agents, Python CLI scripts, SQLite GUI browsers) can safely read and write concurrently.

3. **Next.js Local Data Access Layer (DAL)**:
   - Data access is exposed via Next.js local Node.js API routes (`/api/db/*`), consumed by TanStack Query.
   - Client code is identical across browser development (`npm run dev`) and packaged desktop production (`electron`).
   - All `if (isGuest)` branching across `src/lib/mutations/` and `src/lib/hooks/` is eliminated in favor of unified local endpoints.

4. **External Write Reactivity via WAL Monitoring**:
   - The backend runs a lightweight file watcher on `.db-wal` / `.db`.
   - When external tools modify the database via direct SQL, a debounced (300ms) event notifies the UI, triggering automatic TanStack Query cache invalidations.

5. **Decoupled Visual Assets**:
   - Canvas images and binary files are stored on disk in `%APPDATA%\Kagelin\assets\<hash>.<ext>`.
   - The SQLite `visual_assets` table holds metadata and relative paths, preventing database bloat and allowing external AI tools direct access to raw image files.

6. **Direct-Connect MCP Server**:
   - The MCP server imports `better-sqlite3` and operates directly on `data.db`.
   - The legacy `GuestAssetBridgeHttpHost` browser bridge is deleted. External AI agents can read and write data even when the Kagelin desktop application is closed.

7. **Silent Legacy Data Migration**:
   - On initial launch with an empty SQLite database, the application automatically migrates existing data from `localStorage` (`kanso_guest_data_v11`) and IndexedDB into SQLite, recording a completion flag to guarantee idempotency.

## Consequences

- **External Scriptability & AI Native**: Any tool with SQLite support (Python, Bash, Node, DBeaver) can inspect or mutate Kagelin data directly via SQL.
- **Zero Docker Overhead**: The application requires no background container stack, cutting memory footprint and boot time dramatically.
- **Isomorphic Dev & Prod**: Both development and production run against SQLite files via the same API routes, eliminating origin-isolation and port-persistence quirks.
- **Clean Codebase**: All dual-track guest vs. cloud logic is removed, simplifying state management and reducing maintenance surface.
