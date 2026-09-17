import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  persistServerPort,
  resolveStableServerPort,
} from "../../../electron/server-port";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function makeTempUserDataPath(): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "kagelin-server-port-"),
  );
  tempDirectories.push(directory);
  return directory;
}

describe("Electron server port persistence", () => {
  it("reuses the saved port across application launches", async () => {
    const userDataPath = makeTempUserDataPath();
    let allocations = 0;

    const firstPort = await resolveStableServerPort(userDataPath, async () => {
      allocations += 1;
      return 45_678;
    });
    persistServerPort(userDataPath, firstPort);

    const secondPort = await resolveStableServerPort(userDataPath, async () => {
      allocations += 1;
      return 45_679;
    });

    expect(secondPort).toBe(firstPort);
    expect(allocations).toBe(1);
  });

  it("adopts the last random port from an existing install before allocating a new one", async () => {
    const userDataPath = makeTempUserDataPath();
    fs.writeFileSync(
      path.join(userDataPath, "app.log"),
      [
        "[Electron] Starting Next.js standalone server on port 31111",
        "[Electron] Starting Next.js standalone server on port 42222",
      ].join("\n"),
    );

    let allocated = false;
    const port = await resolveStableServerPort(userDataPath, async () => {
      allocated = true;
      return 45_680;
    });

    expect(port).toBe(42_222);
    expect(allocated).toBe(false);
  });
});
