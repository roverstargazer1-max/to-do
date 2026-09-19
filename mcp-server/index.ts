#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createKagelinMcpServer } from "./server";
import { GuestAssetBridgeHttpHost } from "./guest-bridge-host";

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
  const hasExplicitAccount = Boolean(
    process.env.KAGELIN_MCP_USER_ID?.trim() ||
    process.env.NEXT_PUBLIC_LOCAL_USER_ID?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim(),
  );
  const useGuestBridge =
    process.env.KAGELIN_MCP_USE_GUEST_BRIDGE === "true" || !hasExplicitAccount;

  let bridgeHost: GuestAssetBridgeHttpHost | null = null;
  let bridgeAddress: Awaited<
    ReturnType<GuestAssetBridgeHttpHost["start"]>
  > | null = null;
  if (useGuestBridge) {
    const configuredPort = Number(
      process.env.KAGELIN_GUEST_BRIDGE_PORT ?? "37373",
    );
    const bridgePort =
      Number.isInteger(configuredPort) &&
      configuredPort >= 0 &&
      configuredPort <= 65_535
        ? configuredPort
        : 37_373;
    bridgeHost = new GuestAssetBridgeHttpHost({ port: bridgePort });
    bridgeAddress = await bridgeHost.start();
  }
  const useMockFallback =
    process.env.KAGELIN_MOCK_MODE === "true" ||
    (!process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.SUPABASE_SECRET_KEY);
  const server = createKagelinMcpServer({
    useMockFallback,
    identity:
      process.env.NEXT_PUBLIC_LOCAL_USER_ID ||
      process.env.KAGELIN_MCP_USER_ID ||
      "local-user",
    ...(bridgeHost ? { guestAssetBridge: bridgeHost.connection } : {}),
  });
  const transport = new StdioServerTransport();

  const shutdown = () => {
    void bridgeHost?.close();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await server.connect(transport);
  console.error("Kagelin Workspace AI Builder MCP Server running on stdio.");
  if (bridgeAddress) {
    console.error(
      `Kagelin Guest asset bridge listening on ${bridgeAddress.url}.`,
    );
    console.error(
      `Kagelin Guest asset bridge pairing code: ${bridgeAddress.pairingCode}`,
    );
  }
}

main().catch((err) => {
  console.error("Fatal error in MCP Server:", err);
  process.exit(1);
});
