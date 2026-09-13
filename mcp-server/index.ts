#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createKagelinMcpServer } from "./server";

import { fileURLToPath } from "node:url";

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
  const server = createKagelinMcpServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error("Kagelin Workspace AI Builder MCP Server running on stdio.");
}

main().catch((err) => {
  console.error("Fatal error in MCP Server:", err);
  process.exit(1);
});
