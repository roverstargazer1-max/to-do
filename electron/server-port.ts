import fs from "node:fs";
import path from "node:path";

import net from "node:net";

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

export function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => {
      resolve(false);
    });
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

/**
 * Resolve the origin port used by the packaged renderer.
 *
 * Guest localStorage and IndexedDB are origin-scoped, so changing the port on
 * every Electron launch makes the app appear to lose all local data. Existing
 * installs have no port file yet; the last port in app.log lets those installs
 * keep the most recent origin once before the new port file is written.
 *
 * If the saved port is unavailable (e.g. occupied, or blocked by Windows
 * Hyper-V / WinNAT dynamic excluded port ranges), a newly allocated free port
 * will be used instead.
 */
export async function resolveStableServerPort(
  userDataPath: string,
  allocatePort: () => Promise<number>,
  checkPortAvailable: (port: number) => Promise<boolean> = isPortAvailable,
): Promise<number> {
  const persistedPort = readPortFile(userDataPath);
  if (persistedPort !== null && (await checkPortAvailable(persistedPort))) {
    return persistedPort;
  }

  const legacyPort = readLastPortFromAppLog(userDataPath);
  if (legacyPort !== null && (await checkPortAvailable(legacyPort))) {
    return legacyPort;
  }

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
