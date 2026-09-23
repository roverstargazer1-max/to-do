# ADR 0024: MCP over the app's own loopback HTTP endpoint

## Context

The Kagelin MCP server shipped as a stdio subprocess living inside the source
tree: every client configuration had to hardcode the absolute paths of
`node_modules/tsx` and `mcp-server/index.ts`. That produced three problems:

1. **Distribution break**: a user who installed the DMG has no source tree, so
   the paths in the documented configuration simply do not exist. "Install the
   app and connect your AI client" was not achievable.
2. **Outdated product form**: comparable desktop products expose an
   app-internal MCP endpoint and let the user copy a URL; the stdio-only shape
   required cloning the repository and running Node tooling.
3. **No local authorization boundary**: the MCP identity came only from an
   environment variable (`KAGELIN_MCP_USER_ID` / `NEXT_PUBLIC_LOCAL_USER_ID`),
   so any local process could call the tools without presenting anything.

The embedded Next.js standalone server already runs inside the packaged app and
already receives injected state (`KAGELIN_DB_PATH`, `KAGELIN_ASSETS_PATH`), so
the endpoint no longer needs a process of its own.

## Considered alternatives

- **Option B — separate MCP subprocess bundled into the DMG** (`extraResources`
  plus an Electron `fork`): clean process isolation, but it requires packaging
  the native `better-sqlite3` module for a second runtime, adds a second
  lifecycle and port to manage, and would force the MCP layer to stop importing
  `src/lib` — contradicting the coupling the SQLite overhaul deliberately
  accepted (ADR-0023). High cost, low benefit.
- **Option C — keep stdio, only improve the documentation**: leaves the
  distribution break in place, so the product goal is not met.
- **Option D — endpoint inside the app** (chosen): reuse the embedded server's
  port and process, wrap the existing server factory in the SDK's Streamable
  HTTP transport. No new process, no packaging change, URL-copyable.

## Decision

1. **In-app endpoint**: `app/api/mcp/route.ts` is a thin shell over
   `createHttpHandler()` (`src/lib/mcp/http-transport.ts`), served by the same
   Next.js process and port the renderer uses. The route only wires
   environment-injected credentials to the factory, which owns the SDK
   transport, session bookkeeping, and the authorization gate.
2. **Transport**: the official SDK's Streamable HTTP transport
   (`@modelcontextprotocol/sdk` 1.30.0, no new dependency). POST JSON-RPC with
   SSE streaming responses, GET for the standalone SSE channel, DELETE to
   terminate a session, and `Mcp-Session-Id` reuse. Sessions are held in a map
   and built lazily per session, because one `McpServer` can only be connected
   to one transport.
3. **Authentication**: a random loopback token persisted under the app's
   userData directory (`mcp-token`, mode `0600`) plus an endpoint switch
   (`mcp-enabled`, default off). The token is compared in constant time and is
   read per request, so a settings-page rotation applies without restarting the
   server process. The validator is deliberately narrow
   (`validate(token) => boolean`) so a future hosted deployment can swap it for
   an OAuth 2.1 validator without touching the transport.
4. **Reuse of `createKagelinMcpServer()`**: unchanged. The HTTP and stdio paths
   share it, so tools, receipts, idempotency, and destructive-operation
   confirmation behave identically. `npm run mcp:start` remains as a dev-only
   channel for headless/CI debugging.
5. **Settings surface**: the "AI MCP Architect Channel" card shows endpoint
   status, the enable switch, the URL, the token (hidden by default, resettable
   behind a confirmation), and copyable client configurations for Claude
   Desktop, Cursor, and Claude Code CLI. Endpoint state lives in the Electron main
   process and is read through the preload IPC bridge, never through a web
   endpoint — otherwise any local process could fetch the token and the
   credential would be pointless.
6. **Contract unchanged**: `docs/agents/workspace-ai-contract.md` stays at
   MCP contract `1.2.0`; only the transport description is extended, because no
   tool, schema, or compatibility statement changed.

## Consequences

- **Positive**: a DMG install connects a client with URL plus token and no
  source tree; zero new processes, listeners, or packaging steps; SDK-native
  transport instead of a hand-rolled one; the local credential closes the
  "no authorization boundary" gap for casual same-machine access.
- **Negative / accepted**: MCP shares the lifecycle of the web server, so a
  crash affects both; sessions live in server memory, so restarting the server
  makes clients re-initialize; the loopback token is not a strong boundary (a
  same-user process can read the `0600` file) and remote multi-device access is
  explicitly out of scope until the validator is replaced with OAuth.
- **Migration**: existing stdio configurations keep working for developers, but
  the documented primary path becomes the URL + `Authorization` header form in
  `mcp-server/README.md`.
