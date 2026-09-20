# Spec: Pure Local SQLite Storage Overhaul

## Problem Statement

Currently, Kagelin's data storage is bifurcated and sandboxed.

1. **Sandboxed Data Jail**: In production desktop builds, offline guest data is stored inside Chromium's opaque sandboxed storage (`localStorage` and IndexedDB). Outside tools, CLI scripts, and AI agents cannot directly query or update the user's data files without relying on fragile, hacky browser long-polling bridges (`guest-bridge-host.ts`).
2. **Heavy Container Dependency**: Outside of the guest sandbox, accessing structured SQL data requires running Docker with local Supabase (PostgreSQL, Kong, PostgREST, GoTrue), creating immense overhead for a single-user personal productivity desktop app.
3. **Environment & Origin Fracture**: Data is isolated by origin. A development session on `localhost:3000` has its own isolated IndexedDB, while the packaged Electron app running on a dynamic or static loopback port (`127.0.0.1:<port>`) has a completely separate IndexedDB, causing development and production data to be fractured and inaccessible.

Users and developers need Kagelin to be a true local-first, standalone desktop software where all data is persisted in a clean, transparent, standard SQLite database file on the local filesystem.

## Solution

Migrate the entire underlying storage layer from Web IndexedDB/localStorage/Supabase to a unified native local SQLite database file located at `%APPDATA%\Kagelin\data.db` (with environment isolation for development).

- Utilize `better-sqlite3` with Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) and 5-second busy timeout to enable safe, high-throughput, concurrent multi-process reads and writes.
- Serve database operations via Next.js local Node.js API routes, keeping the client React/TanStack Query layer 100% isomorphic across browser development and packaged Electron production.
- Watch SQLite WAL file changes (`data.db-wal`) to automatically invalidate TanStack Query caches, ensuring that when external AI or tools modify the database via SQL, the desktop UI updates reactively within hundreds of milliseconds.
- Decouple binary visual assets into a dedicated `%APPDATA%\Kagelin\assets\` directory, keeping the database light and transparent.
- Upgrade the Model Context Protocol (MCP) server to directly connect to SQLite, removing browser bridge dependencies and allowing AI agents to query and manipulate data even when the desktop client is closed.
- Automatically and silently migrate legacy IndexedDB and `localStorage` data into SQLite on first launch.

## User Stories

1. As a desktop productivity user, I want Kagelin to store all my tasks, projects, habits, and workspaces in a local SQLite file, so that I own my data completely without needing Docker, third-party cloud accounts, or internet connectivity.
2. As a desktop productivity user, I want the app to launch directly into my workspace without requiring registration, login, or authentication credentials, so that I can capture thoughts with zero friction.
3. As an external AI agent (e.g. Antigravity, Claude, Cursor), I want to connect directly to `%APPDATA%\Kagelin\data.db` via SQL or MCP, so that I can analyze tasks, organize projects, and schedule events even when the Kagelin UI is closed.
4. As a desktop user, I want the UI to automatically refresh when an external AI agent inserts or modifies tasks via SQL, so that I immediately see AI actions reflected in my workspace without having to manually restart or refresh the app.
5. As a developer building tools or automations, I want to write CLI scripts in Python, Bash, or Node to batch-insert tasks or read metrics from SQLite, so that I can integrate Kagelin with my custom workflows.
6. As a power user, I want to use standard SQLite GUI tools (such as DBeaver, TablePlus, or SQLite CLI) to inspect, query, and repair my database, so that I am never locked into proprietary or sandboxed data formats.
7. As a visual canvas user, I want images and media attached to canvas nodes to be stored as discrete files in a standard assets folder, so that my database file remains small and fast, and I can access or inspect raw images directly in File Explorer.
8. As an existing Kagelin user updating to the new version, I want my historical tasks, habits, and canvas nodes from IndexedDB to be silently and automatically migrated to SQLite on first startup, so that I do not lose any of my existing data.
9. As a privacy-focused user, I want a single-click "Export Database Snapshot" button in settings, so that I can instantly copy a point-in-time `.db` snapshot for cold backups.
10. As a user with multiple devices, I want to back up my entire SQLite database and JSON payload to my self-hosted WebDAV server, so that I retain complete multi-device disaster recovery capability.
11. As a core developer, I want development mode to default to a local `.scratch/data.dev.db` database while allowing override via `KAGELIN_DB_PATH`, so that test runs and experiments never corrupt my real personal production data.
12. As a core developer, I want schema migrations to execute automatically via an embedded pure-SQL migration runner on startup, so that database schemas stay in sync without heavyweight ORM overhead.
13. As a user operating on battery power, I want multi-process database reads and writes to use WAL mode and memory-mapped I/O, so that disk writes are minimal, efficient, and never freeze the interface.
14. As a power user reorganizing projects, I want cascade-deleting a project or canvas to automatically delete associated subtasks and connections through SQLite foreign keys, so that the database remains structurally consistent without orphan records.

## Implementation Decisions

- **Storage Engine & Concurrency**:
  - The persistence tier uses `better-sqlite3` running inside the Node.js environment (Next.js server child process in Electron, and Next.js dev server in local development).
  - WAL mode (`PRAGMA journal_mode = WAL;`) is activated on every database connection handle.
  - Concurrency settings enforce `PRAGMA busy_timeout = 5000;`, `PRAGMA synchronous = NORMAL;`, and `PRAGMA foreign_keys = ON;`.
- **Database Paths**:
  - Production path: `%APPDATA%\Kagelin\data.db` on Windows (using standard system app data paths on macOS/Linux).
  - Development path: `.scratch/data.dev.db` inside the project root.
  - Runtime resolution: `process.env.KAGELIN_DB_PATH` overrides the default in any environment.
- **Client-Server Communication & Data Access**:
  - Next.js local API routes (`/api/db/*`) act as the local Data Access Layer (DAL) exposing strongly-typed endpoints for tasks, projects, habits, focus sessions, and workspaces.
  - TanStack Query on the frontend consumes these local loopback endpoints (`http://127.0.0.1:<port>/api/db/...`), keeping the renderer code identical between browser development and packaged Electron.
  - Legacy `isGuest` branching and Supabase client calls in `src/lib/mutations/` and `src/lib/hooks/` are replaced with unified local DAL calls.
- **External Write Reactivity**:
  - A file-watcher module in the backend monitors file system modification events on the database directory (specifically `.db-wal` and `.db`).
  - Upon detecting external writes, it debounces for 300ms and broadcasts a lightweight invalidation signal to the frontend, causing TanStack Query to perform background refetches.
- **Visual Assets Storage**:
  - Uploaded/pasted images and binary blobs are saved directly to `%APPDATA%\Kagelin\assets\<sha256>.<ext>`.
  - The `visual_assets` table stores only metadata (relative path, hash, MIME type, width, height, created timestamp).
  - A local asset streaming route (`/api/assets/[hash]`) serves images to the canvas renderer.
- **MCP Server Refactoring**:
  - The `mcp-server` process imports `better-sqlite3` directly and opens the same SQLite file in WAL mode.
  - The legacy `GuestAssetBridgeHttpHost` reverse long-polling HTTP bridge is deprecated and removed.
  - MCP tools operate directly on SQLite tables and repositories.
- **Legacy Migration**:
  - On application startup, the client checks if SQLite has been initialized. If the database is empty and legacy `localStorage` (`kanso_guest_data_v11`) or IndexedDB keys (`kanso-guest-workspaces`) are present, it POSTs them to `/api/db/migrate-legacy` to perform a single-transaction import, marking `kanso_sqlite_migrated_v1 = true` upon completion.
- **Schema Management**:
  - A lightweight migrator tracks `PRAGMA user_version` and executes numbered pure SQL migration files sequentially in individual transactions.

## Testing Decisions

- **Testing Philosophy**:
  - Tests must verify external behavior (the contract of mutations, queries, concurrency, and persistence) rather than mocking database internals.
  - SQLite tests must run against real SQLite databases in temporary directories or `:memory:` mode, ensuring real SQL constraints, WAL behaviors, and foreign key cascades are validated.
- **Testing Seams**:
  - **Highest Seam (Repository & Local API Layer)**: Test through `src/lib/db/repositories/*` and Next.js API route handlers. Verifies that given domain inputs, rows are written to SQLite and returned in the expected shape.
  - **Concurrency Seam**: Spawn parallel Node processes performing rapid concurrent writes to verify that `PRAGMA busy_timeout` eliminates `SQLITE_BUSY` errors under WAL mode.
  - **MCP Tool Seam**: Test MCP tools by executing MCP calls against an isolated SQLite test database and verifying that the database state reflects the tool calls.
  - **Watcher Seam**: Simulate an external process writing to SQLite and verify that the file watcher triggers the debounce callback and invalidation event.
- **Prior Art**:
  - Existing tests in `tests/unit/mutations/` and `tests/unit/mcp/` serve as behavioral reference points for mutation results, recurrence calculations, and tool call payload validation.

## Out of Scope

- Multi-tenant cloud hosting and SaaS user account authentication (Kagelin becomes a focused, single-user local standalone application).
- Multi-vault workspace database switching (all workspaces, projects, and tasks exist within a single unified database file for this release).
- Real-time peer-to-peer WebRTC mesh synchronization across different physical computers (cross-device sync remains file-based via WebDAV backup/restore).

## Further Notes

- By eliminating Supabase Docker containers and external PostgreSQL, local resource consumption (RAM and CPU) is dramatically reduced, turning Kagelin into an instant-launch native productivity suite.
- Opening the database file enables rich third-party ecosystem scripting, local LLM integrations, and custom dashboards.
