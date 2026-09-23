/**
 * Persisted loopback credentials for the in-app MCP HTTP endpoint.
 *
 * The desktop app owns this state: `electron/main.ts` reads or generates the
 * token before spawning the embedded Next.js server, and the `/api/mcp` route
 * reads the same directory to authorize requests. The directory is injected
 * (`KAGELIN_MCP_DIR` in production, an explicit path in tests), so this module
 * never touches Electron APIs and stays testable as pure file logic.
 *
 * Files are mode `0600`: the token is a local-only bearer credential and the
 * rest of the app already relies on a local trust model, but nothing else on
 * the machine should be able to read it off disk.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const MCP_TOKEN_FILENAME = "mcp-token";
export const MCP_ENABLED_FILENAME = "mcp-enabled";

const TOKEN_BYTES = 32;
const PRIVATE_FILE_MODE = 0o600;

/**
 * Authorization seam for the MCP HTTP transport. Kept intentionally narrow
 * (`validate(token) => boolean`) so a hosted deployment can swap the token for
 * an OAuth 2.1 validator without touching the transport factory.
 */
export type McpTokenValidator = (token: string | null | undefined) => boolean;

export interface McpAccessStore {
  readonly directory: string;
  readonly tokenPath: string;
  readonly enabledPath: string;
  /** The persisted token, or `null` when none has been written yet. */
  readToken(): string | null;
  /** Returns the persisted token, generating and persisting one if absent. */
  ensureToken(): string;
  /** Rotates the token, overwriting the previous value and returning the new one. */
  resetToken(): string;
  /** Constant-time credential check. */
  readonly validate: McpTokenValidator;
  /** Endpoint switch (`false` until the user enables it in settings). */
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
}

export function generateMcpToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Constant-time string comparison. Both sides are hashed to a fixed width
 * first so the comparison cost does not leak the expected token length.
 */
export function constantTimeEqual(left: string, right: string): boolean {
  const leftDigest = crypto.createHash("sha256").update(left, "utf8").digest();
  const rightDigest = crypto
    .createHash("sha256")
    .update(right, "utf8")
    .digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

function writePrivateFile(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, {
    encoding: "utf8",
    mode: PRIVATE_FILE_MODE,
  });
  // `writeFileSync` only applies the mode when it creates the file, so an
  // overwrite of a legacy file with wider permissions needs an explicit chmod.
  fs.chmodSync(filePath, PRIVATE_FILE_MODE);
}

function readTrimmed(filePath: string): string | null {
  try {
    const value = fs.readFileSync(filePath, "utf8").trim();
    return value.length > 0 ? value : null;
  } catch {
    // Missing or unreadable credential files are treated as "not configured";
    // `validate` then fails closed and `ensureToken` re-creates the file.
    return null;
  }
}

export function createMcpAccessStore(directory: string): McpAccessStore {
  const tokenPath = path.join(directory, MCP_TOKEN_FILENAME);
  const enabledPath = path.join(directory, MCP_ENABLED_FILENAME);

  const readToken = (): string | null => readTrimmed(tokenPath);

  const resetToken = (): string => {
    const token = generateMcpToken();
    writePrivateFile(tokenPath, `${token}\n`);
    return token;
  };

  const ensureToken = (): string => readToken() ?? resetToken();

  // Reads through to disk on every call: a settings-page rotation must take
  // effect for the running server process without a restart.
  const validate: McpTokenValidator = (token) => {
    const expected = readToken();
    if (!expected || typeof token !== "string" || token.length === 0) {
      return false;
    }
    return constantTimeEqual(token, expected);
  };

  const isEnabled = (): boolean => readTrimmed(enabledPath) === "true";

  const setEnabled = (enabled: boolean): void => {
    writePrivateFile(enabledPath, enabled ? "true\n" : "false\n");
  };

  return {
    directory,
    tokenPath,
    enabledPath,
    readToken,
    ensureToken,
    resetToken,
    validate,
    isEnabled,
    setEnabled,
  };
}
