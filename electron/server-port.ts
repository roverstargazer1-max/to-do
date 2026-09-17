import fs from "node:fs";
import path from "node:path";

const SERVER_PORT_FILE = "server-port";

function validPort(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 65_535;
}

function parsePort(value: string | undefined): number | null {
  if (!value) return null;
  const port = Number(value.trim());
  return validPort(port) ? port : null;
}

function readPortFile(userDataPath: string): number | null {
  try {
    return parsePort(
      fs.readFileSync(path.join(userDataPath, SERVER_PORT_FILE), "utf8"),
    );
  } catch {
    return null;
  }
}

function readLastPortFromAppLog(userDataPath: string): number | null {
  try {
    const log = fs.readFileSync(path.join(userDataPath, "app.log"), "utf8");
    const matches = [
      ...log.matchAll(
        /Starting Next\.js standalone server(?: from:.*)? on port (\d+)/g,
      ),
    ];
    return parsePort(matches.at(-1)?.[1]);
  } catch {
    return null;
  }
}

/**
 * Resolve the origin port used by the packaged renderer.
 *
 * Guest localStorage and IndexedDB are origin-scoped, so changing the port on
 * every Electron launch makes the app appear to lose all local data. Existing
 * installs have no port file yet; the last port in app.log lets those installs
 * keep the most recent origin once before the new port file is written.
 */
export async function resolveStableServerPort(
  userDataPath: string,
  allocatePort: () => Promise<number>,
): Promise<number> {
  const persistedPort = readPortFile(userDataPath);
  if (persistedPort !== null) return persistedPort;

  const legacyPort = readLastPortFromAppLog(userDataPath);
  if (legacyPort !== null) return legacyPort;

  const allocatedPort = await allocatePort();
  if (!validPort(allocatedPort)) {
    throw new Error(
      `Electron server returned an invalid port: ${allocatedPort}`,
    );
  }
  return allocatedPort;
}

export function persistServerPort(userDataPath: string, port: number): void {
  if (!validPort(port)) {
    throw new Error(`Cannot persist an invalid Electron server port: ${port}`);
  }
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(
    path.join(userDataPath, SERVER_PORT_FILE),
    `${port}\n`,
    "utf8",
  );
}
