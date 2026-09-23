import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MCP_ENABLED_FILENAME,
  MCP_TOKEN_FILENAME,
  constantTimeEqual,
  createMcpAccessStore,
  generateMcpToken,
} from "@/lib/mcp/token";

function fileMode(filePath: string): number {
  return fs.statSync(filePath).mode & 0o777;
}

describe("MCP access store", () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "kagelin-mcp-token-"));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("reports no token before one has been generated", () => {
    const store = createMcpAccessStore(directory);

    expect(store.readToken()).toBeNull();
    expect(store.tokenPath).toBe(path.join(directory, MCP_TOKEN_FILENAME));
    expect(store.validate("anything")).toBe(false);
  });

  it("persists a generated token with 0600 permissions", () => {
    const store = createMcpAccessStore(directory);

    const token = store.ensureToken();

    expect(store.readToken()).toBe(token);
    expect(fs.readFileSync(store.tokenPath, "utf8").trim()).toBe(token);
    expect(fileMode(store.tokenPath)).toBe(0o600);
  });

  it("reuses the persisted token across store instances", () => {
    const first = createMcpAccessStore(directory).ensureToken();
    const second = createMcpAccessStore(directory).ensureToken();

    expect(second).toBe(first);
  });

  it("rotates the token, invalidating the previous value", () => {
    const store = createMcpAccessStore(directory);
    const before = store.ensureToken();

    const after = store.resetToken();

    expect(after).not.toBe(before);
    expect(store.readToken()).toBe(after);
    expect(store.validate(before)).toBe(false);
    expect(store.validate(after)).toBe(true);
    expect(fileMode(store.tokenPath)).toBe(0o600);
  });

  it("rejects missing, empty, and wrong tokens", () => {
    const store = createMcpAccessStore(directory);
    const token = store.ensureToken();

    expect(store.validate(null)).toBe(false);
    expect(store.validate(undefined)).toBe(false);
    expect(store.validate("")).toBe(false);
    expect(store.validate(`${token}x`)).toBe(false);
    expect(store.validate(token.slice(0, -1))).toBe(false);
    expect(store.validate(token)).toBe(true);
  });

  it("keeps the endpoint disabled until the switch is written", () => {
    const store = createMcpAccessStore(directory);

    expect(store.isEnabled()).toBe(false);

    store.setEnabled(true);

    expect(store.isEnabled()).toBe(true);
    expect(createMcpAccessStore(directory).isEnabled()).toBe(true);
    expect(store.enabledPath).toBe(path.join(directory, MCP_ENABLED_FILENAME));
    expect(fileMode(store.enabledPath)).toBe(0o600);

    store.setEnabled(false);

    expect(store.isEnabled()).toBe(false);
  });

  it("mints url-safe tokens with 256 bits of entropy", () => {
    const token = generateMcpToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).toHaveLength(43);
    expect(generateMcpToken()).not.toBe(token);
  });

  it("compares tokens without leaking length", () => {
    expect(constantTimeEqual("token", "token")).toBe(true);
    expect(constantTimeEqual("token", "tokens")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });
});
