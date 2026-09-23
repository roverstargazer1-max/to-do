import { createKagelinMcpServer } from "../../../mcp-server/server";
import { createHttpHandler } from "@/lib/mcp/http-transport";
import {
  constantTimeEqual,
  createMcpAccessStore,
  type McpTokenValidator,
} from "@/lib/mcp/token";

/**
 * Thin shell over the MCP Streamable HTTP handler (ADR-0024).
 *
 * The endpoint is served by the same Next.js process that already holds the
 * SQLite connection, so it inherits the app's port and lifecycle. Credentials
 * come from disk: the desktop app injects `KAGELIN_MCP_DIR` and owns the token
 * file, while `KAGELIN_MCP_TOKEN` covers source-tree development where no
 * embedded server process exists.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const accessDirectory = process.env.KAGELIN_MCP_DIR?.trim();
const injectedToken = process.env.KAGELIN_MCP_TOKEN?.trim();
const accessStore = accessDirectory
  ? createMcpAccessStore(accessDirectory)
  : null;

const tokenValidator: McpTokenValidator = accessStore
  ? accessStore.validate
  : (token) =>
      injectedToken ? constantTimeEqual(token ?? "", injectedToken) : false;

// Module scope keeps the session map alive across requests; the store reads the
// token file per request so a settings-page rotation applies immediately.
const handler = createHttpHandler({
  createServer: () =>
    createKagelinMcpServer({
      useMockFallback: false,
      identity:
        process.env.NEXT_PUBLIC_LOCAL_USER_ID ||
        process.env.KAGELIN_MCP_USER_ID ||
        "local_user",
    }),
  tokenValidator,
  isEnabled: () =>
    accessStore ? accessStore.isEnabled() : Boolean(injectedToken),
});

export async function GET(request: Request): Promise<Response> {
  return handler(request);
}

export async function POST(request: Request): Promise<Response> {
  return handler(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handler(request);
}
