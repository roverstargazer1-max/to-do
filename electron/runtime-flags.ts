import * as path from "node:path";
import * as net from "node:net";

export interface CommandLineApplier {
  appendSwitch(switchName: string, value?: string): void;
}

export interface AppTranslationChecker {
  runningUnderARM64Translation?: boolean;
}

/**
 * Configure Chromium command-line switches based on platform.
 *
 * On macOS:
 * - Omits --enable-zero-copy and --ignore-gpu-blocklist to avoid Metal/Angle compositor stalls.
 * - Retains hardware rasterization (enable-gpu-rasterization).
 * - Avoids Windows-only switches like CalculateNativeWinOcclusion.
 */
export function applyChromiumSwitches(
  commandLine: CommandLineApplier,
  platform: NodeJS.Platform = process.platform,
): void {
  commandLine.appendSwitch("enable-gpu-rasterization");
  commandLine.appendSwitch("js-flags", "--max-old-space-size=160 --expose-gc");
  commandLine.appendSwitch("enable-features", "MemorySaverMode");

  if (platform !== "darwin") {
    commandLine.appendSwitch("enable-zero-copy");
    commandLine.appendSwitch("ignore-gpu-blocklist");
  }

  if (platform === "win32") {
    commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
  }
}

/**
 * Inspect whether the application is running under Rosetta 2 x86 translation on Apple Silicon.
 * Writes an actionable diagnostic warning to app logs if emulation is detected.
 */
export function checkRosettaTranslation(
  appInstance?: AppTranslationChecker,
  logger: (msg: string, isError?: boolean) => void = console.warn,
): boolean {
  if (appInstance?.runningUnderARM64Translation) {
    logger(
      "[Electron][Performance Warning] Running under Rosetta 2 x86 translation on Apple Silicon. This introduces emulation overhead and increases memory usage. Please install the native arm64 build for optimal performance.",
      true,
    );
    return true;
  }
  return false;
}

/**
 * V8 flags for Next.js standalone child process.
 * Caps heap to 160MB to prevent unbounded memory growth and exposes GC for post-boot and idle purging.
 */
export function getStandaloneServerExecArgv(): string[] {
  return ["--max-old-space-size=160", "--expose-gc"];
}

export interface StandaloneServerSpawnOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  execArgv: string[];
  stdio: ("ignore" | "pipe" | "ipc")[];
}

export function buildStandaloneServerSpawnConfig(
  serverPath: string,
  port: number,
  userDataPath: string,
  baseEnv: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  mcpToken?: string,
): { serverPath: string; options: StandaloneServerSpawnOptions } {
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    ELECTRON_RUN_AS_NODE: "1",
    KAGELIN_DB_PATH:
      baseEnv.KAGELIN_DB_PATH || path.join(userDataPath, "data.db"),
    KAGELIN_ASSETS_PATH:
      baseEnv.KAGELIN_ASSETS_PATH || path.join(userDataPath, "assets"),
    // The MCP endpoint authorizes against the token file in `KAGELIN_MCP_DIR`
    // (read per request so a rotation applies without a restart); the token
    // itself is passed along for parity with the other injected data paths.
    KAGELIN_MCP_DIR: baseEnv.KAGELIN_MCP_DIR || userDataPath,
    NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`,
  };

  if (mcpToken) {
    env.KAGELIN_MCP_TOKEN = mcpToken;
  }

  return {
    serverPath,
    options: {
      cwd: path.dirname(serverPath),
      env,
      execArgv: getStandaloneServerExecArgv(),
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  };
}

export function waitForServer(url: string, timeoutMs = 25000): Promise<void> {
  const parsed = new URL(url);
  const port = Number(parsed.port) || (parsed.protocol === "https:" ? 443 : 80);
  const host =
    parsed.hostname === "localhost"
      ? "127.0.0.1"
      : parsed.hostname || "127.0.0.1";
  const start = Date.now();

  return new Promise((resolve, reject) => {
    let resolved = false;

    const check = () => {
      if (resolved) return;
      const socket = net.createConnection({ port, host }, () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve();
        }
      });

      socket.setTimeout(1000, () => {
        socket.destroy();
        retry();
      });

      socket.on("error", () => {
        socket.destroy();
        retry();
      });
    };

    const retry = () => {
      if (resolved) return;
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timeout waiting for Next.js server at ${url}`));
      } else {
        const delay = Date.now() - start < 1500 ? 50 : 150;
        setTimeout(check, delay);
      }
    };

    check();
  });
}
