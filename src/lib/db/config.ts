import * as path from "node:path";
import * as fs from "node:fs";

/**
 * System application-data directories are resolved from environment variables
 * through dynamically-assembled keys. The bundler's file tracer resolves
 * literal paths (and `os.homedir()`) and then crawls them, which fails on
 * protected system folders such as `%APPDATA%\Microsoft\Windows\Start Menu`.
 */
function joinSegments(...segments: string[]): string {
  return segments.join(path.sep);
}

function envValue(...segments: string[]): string | undefined {
  const env = process["env"];
  return env[segments.join("")];
}

function systemAppDataBaseDir(): string {
  const platform = process.platform;

  if (platform === "win32") {
    const appData = envValue("APP", "DATA");
    if (appData) return appData;
    const home = envValue("USER", "PROFILE");
    if (home) return joinSegments(home, "App Data", "Roaming");
  } else if (platform === "darwin") {
    const home = envValue("HO", "ME");
    if (home) return joinSegments(home, "Library", "Application Support");
  } else {
    const xdg = envValue("XDG_CONFIG", "_HOME");
    if (xdg) return xdg;
    const home = envValue("HO", "ME");
    if (home) return joinSegments(home, ".config");
  }

  // Last resort for environments without the variables above. The packaged
  // desktop app always receives explicit KAGELIN_DB_PATH / KAGELIN_ASSETS_PATH
  // values from the Electron main process, so this branch is a dev safeguard.
  return joinSegments(process.cwd(), ".kagelin-data");
}

export function getDatabasePath(): string {
  if (process.env.KAGELIN_DB_PATH) {
    return path.resolve(process.env.KAGELIN_DB_PATH);
  }

  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    return path.join(systemAppDataBaseDir(), "Kagelin", "data.db");
  }

  return path.resolve(process.cwd(), ".scratch", "data.dev.db");
}

export function ensureDatabaseDir(dbPath?: string): string {
  const target = dbPath || getDatabasePath();
  if (target === ":memory:") return target;

  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return target;
}

export function getAssetDirPath(): string {
  if (process.env.KAGELIN_ASSETS_PATH) {
    const dir = path.resolve(process.env.KAGELIN_ASSETS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  const isProd = process.env.NODE_ENV === "production";
  const dir = isProd
    ? path.join(systemAppDataBaseDir(), "Kagelin", "assets")
    : path.resolve(process.cwd(), ".scratch", "assets");

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
