#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerLocalDal, getLocalDal } from "../src/lib/api/local-dal";
import { createNodeLocalDal } from "../src/lib/api/local-dal-node";
import { createKagelinMcpServer } from "./server";

// Load environment variables from .env.local if present
try {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const repoEnvPath = path.resolve(currentDir, "..", ".env.local");
  const cwdEnvPath = path.resolve(process.cwd(), ".env.local");
  const envPath = fs.existsSync(repoEnvPath) ? repoEnvPath : cwdEnvPath;
  if (fs.existsSync(envPath) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envPath);
  }
} catch (err) {
  console.error("Warning: Failed to load .env.local:", err);
}

async function main() {
  if (!getLocalDal()) {
    registerLocalDal(createNodeLocalDal());
  }

  const server = createKagelinMcpServer({
    useMockFallback: false,
    identity:
      process.env.NEXT_PUBLIC_LOCAL_USER_ID ||
      process.env.KAGELIN_MCP_USER_ID ||
      "local_user",
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Kagelin Local SQLite Native MCP Server running on stdio.");
}

main().catch((err) => {
  console.error("Fatal error in MCP Server:", err);
  process.exit(1);
});
