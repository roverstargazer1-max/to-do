import * as http from "node:http";
import * as net from "node:net";
import { describe, expect, it, vi } from "vitest";
import {
  applyChromiumSwitches,
  buildStandaloneServerSpawnConfig,
  checkRosettaTranslation,
  getStandaloneServerExecArgv,
  waitForServer,
  type CommandLineApplier,
} from "../../../electron/runtime-flags";

describe("Electron runtime switches and platform tuning", () => {
  it("applies macOS-tuned switches (enables GPU rasterization, omits zero-copy and blocklist ignore)", () => {
    const switches: Array<{ switchName: string; value?: string }> = [];
    const commandLine: CommandLineApplier = {
      appendSwitch: (switchName, value) => {
        switches.push({ switchName, value });
      },
    };

    applyChromiumSwitches(commandLine, "darwin");

    const switchNames = switches.map((s) => s.switchName);

    expect(switchNames).toContain("enable-gpu-rasterization");
    expect(switches).toContainEqual({
      switchName: "js-flags",
      value: "--max-old-space-size=160 --expose-gc",
    });
    expect(switches).toContainEqual({
      switchName: "enable-features",
      value: "MemorySaverMode",
    });
    expect(switchNames).not.toContain("enable-zero-copy");
    expect(switchNames).not.toContain("ignore-gpu-blocklist");
    expect(switchNames).not.toContain("disable-features");
  });

  it("applies Windows-tuned switches including CalculateNativeWinOcclusion", () => {
    const switches: Array<{ switchName: string; value?: string }> = [];
    const commandLine: CommandLineApplier = {
      appendSwitch: (switchName, value) => {
        switches.push({ switchName, value });
      },
    };

    applyChromiumSwitches(commandLine, "win32");

    const switchNames = switches.map((s) => s.switchName);

    expect(switchNames).toContain("enable-gpu-rasterization");
    expect(switchNames).toContain("enable-zero-copy");
    expect(switchNames).toContain("ignore-gpu-blocklist");
    expect(switches).toContainEqual({
      switchName: "js-flags",
      value: "--max-old-space-size=160 --expose-gc",
    });
    expect(switches).toContainEqual({
      switchName: "enable-features",
      value: "MemorySaverMode",
    });
    expect(switches).toContainEqual({
      switchName: "disable-features",
      value: "CalculateNativeWinOcclusion",
    });
  });

  it("applies Linux-tuned switches without Windows occlusion disable", () => {
    const switches: Array<{ switchName: string; value?: string }> = [];
    const commandLine: CommandLineApplier = {
      appendSwitch: (switchName, value) => {
        switches.push({ switchName, value });
      },
    };

    applyChromiumSwitches(commandLine, "linux");

    const switchNames = switches.map((s) => s.switchName);

    expect(switchNames).toContain("enable-gpu-rasterization");
    expect(switchNames).toContain("enable-zero-copy");
    expect(switchNames).toContain("ignore-gpu-blocklist");
    expect(switches).toContainEqual({
      switchName: "js-flags",
      value: "--max-old-space-size=160 --expose-gc",
    });
    expect(switches).toContainEqual({
      switchName: "enable-features",
      value: "MemorySaverMode",
    });
    expect(switchNames).not.toContain("disable-features");
  });
});

describe("Rosetta 2 translation detection", () => {
  it("logs a prominent diagnostic warning when running under Rosetta 2", () => {
    const logger = vi.fn();
    const isRosetta = checkRosettaTranslation(
      { runningUnderARM64Translation: true },
      logger,
    );

    expect(isRosetta).toBe(true);
    expect(logger).toHaveBeenCalledTimes(1);
    expect(logger.mock.calls[0][0]).toContain("Rosetta 2");
    expect(logger.mock.calls[0][0]).toContain("arm64");
    expect(logger.mock.calls[0][1]).toBe(true);
  });

  it("does not log or warn when running natively", () => {
    const logger = vi.fn();
    const isRosetta = checkRosettaTranslation(
      { runningUnderARM64Translation: false },
      logger,
    );

    expect(isRosetta).toBe(false);
    expect(logger).not.toHaveBeenCalled();
  });
});

describe("Next.js standalone subprocess heap governance", () => {
  it("configures 160MB max old space size and exposes garbage collection without aggressive size optimization flags", () => {
    const execArgv = getStandaloneServerExecArgv();

    expect(execArgv).toContain("--max-old-space-size=160");
    expect(execArgv).toContain("--expose-gc");
    expect(execArgv).not.toContain("--optimize-for-size");
  });

  it("builds correct standalone server spawn configuration with constrained heap flags", () => {
    const config = buildStandaloneServerSpawnConfig(
      "/path/to/.next/standalone/server.js",
      4321,
      "/mock/userData",
      { CUSTOM_ENV: "test" },
    );

    expect(config.serverPath).toBe("/path/to/.next/standalone/server.js");
    expect(config.options.cwd).toBe("/path/to/.next/standalone");
    expect(config.options.execArgv).toEqual([
      "--max-old-space-size=160",
      "--expose-gc",
    ]);
    expect(config.options.env.PORT).toBe("4321");
    expect(config.options.env.HOSTNAME).toBe("127.0.0.1");
    expect(config.options.env.NODE_ENV).toBe("production");
    expect(config.options.env.NEXT_PUBLIC_APP_URL).toBe(
      "http://127.0.0.1:4321",
    );
    expect(config.options.stdio).toEqual(["ignore", "pipe", "pipe", "ipc"]);
  });

  it("injects the MCP access directory and token into the standalone server", () => {
    const config = buildStandaloneServerSpawnConfig(
      "/path/to/.next/standalone/server.js",
      4321,
      "/mock/userData",
      { CUSTOM_ENV: "test" },
      "loopback-token",
    );

    expect(config.options.env.KAGELIN_MCP_DIR).toBe("/mock/userData");
    expect(config.options.env.KAGELIN_MCP_TOKEN).toBe("loopback-token");
  });

  it("omits the MCP token when the caller has none to inject", () => {
    const config = buildStandaloneServerSpawnConfig(
      "/path/to/.next/standalone/server.js",
      4321,
      "/mock/userData",
      {},
    );

    expect(config.options.env.KAGELIN_MCP_DIR).toBe("/mock/userData");
    expect(config.options.env.KAGELIN_MCP_TOKEN).toBeUndefined();
  });

  it("successfully passes health check on local port binding", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK");
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address() as net.AddressInfo;
    const url = `http://127.0.0.1:${address.port}`;

    try {
      await expect(waitForServer(url, 2000)).resolves.toBeUndefined();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("rejects when server fails to bind within timeout", async () => {
    const unreachableUrl = "http://127.0.0.1:49999";
    await expect(waitForServer(unreachableUrl, 300)).rejects.toThrow(
      "Timeout waiting for Next.js server",
    );
  });
});
