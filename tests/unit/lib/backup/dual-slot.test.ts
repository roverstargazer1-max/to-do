import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NextRequest } from "next/server";
import {
  GET as getBackupSlot,
  POST as postBackupSlot,
} from "@/../app/api/db/backup-slot/route";
import type { BackupData } from "@/lib/backup/types";
import type { Task } from "@/lib/types/task";

describe("A/B Dual-Slot Backup System", () => {
  let tempDir: string;
  let testDbPath: string;
  let originalDbEnv: string | undefined;

  const mockBackupData: BackupData = {
    metadata: {
      version: 1,
      appVersion: "1.4.1",
      exportedAt: "2026-09-22T10:00:00.000Z",
    },
    tasks: [
      {
        id: "task-1",
        content: "Backup test task",
        created_at: "2026-09-22T10:00:00.000Z",
        updated_at: "2026-09-22T10:00:00.000Z",
        priority: 1,
        is_completed: false,
      } as unknown as Task,
    ],
    projects: [],
    habits: [],
    habit_entries: [],
    focus_logs: [],
    events: [],
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kagelin-dual-slot-test-"));
    testDbPath = path.join(tempDir, "data.db");
    originalDbEnv = process.env.KAGELIN_DB_PATH;
    process.env.KAGELIN_DB_PATH = testDbPath;
  });

  afterEach(() => {
    if (originalDbEnv) process.env.KAGELIN_DB_PATH = originalDbEnv;
    else delete process.env.KAGELIN_DB_PATH;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("stages backup into Slot B without touching Slot A baseline", async () => {
    // 1. Stage mockBackupData into Slot B
    const stageReq = new NextRequest(
      "http://localhost:3000/api/db/backup-slot",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "stage",
          data: mockBackupData,
        }),
      },
    );
    const stageRes = await postBackupSlot(stageReq);
    expect(stageRes.status).toBe(200);

    const stageJson = await stageRes.json();
    expect(stageJson.success).toBe(true);
    expect(stageJson.slot).toBe("staged");

    // 2. Query Slot B (staged)
    const getStagedReq = new NextRequest(
      "http://localhost:3000/api/db/backup-slot?slot=staged",
    );
    const getStagedRes = await getBackupSlot(getStagedReq);
    const stagedData = await getStagedRes.json();
    expect(stagedData.exists).toBe(true);
    expect(stagedData.data.tasks[0].content).toBe("Backup test task");

    // 3. Verify Slot A (baseline) is still untouched / does not exist
    const getBaselineReq = new NextRequest(
      "http://localhost:3000/api/db/backup-slot?slot=baseline",
    );
    const getBaselineRes = await getBackupSlot(getBaselineReq);
    const baselineData = await getBaselineRes.json();
    expect(baselineData.exists).toBe(false);
  });

  it("atomically promotes Slot B into Slot A baseline upon confirmation", async () => {
    // 1. Stage into Slot B
    const stageReq = new NextRequest(
      "http://localhost:3000/api/db/backup-slot",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "stage",
          data: mockBackupData,
        }),
      },
    );
    await postBackupSlot(stageReq);

    // 2. Promote Slot B to Slot A
    const promoteReq = new NextRequest(
      "http://localhost:3000/api/db/backup-slot",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "promote",
        }),
      },
    );
    const promoteRes = await postBackupSlot(promoteReq);
    expect(promoteRes.status).toBe(200);
    const promoteJson = await promoteRes.json();
    expect(promoteJson.success).toBe(true);
    expect(promoteJson.slot).toBe("baseline");

    // 3. Verify Slot A baseline now holds the staged data
    const getBaselineReq = new NextRequest(
      "http://localhost:3000/api/db/backup-slot?slot=baseline",
    );
    const getBaselineRes = await getBackupSlot(getBaselineReq);
    const baselineData = await getBaselineRes.json();
    expect(baselineData.exists).toBe(true);
    expect(baselineData.data.tasks[0].content).toBe("Backup test task");
  });

  it("returns error if promote is called before any staged backup exists", async () => {
    const promoteReq = new NextRequest(
      "http://localhost:3000/api/db/backup-slot",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "promote",
        }),
      },
    );
    const promoteRes = await postBackupSlot(promoteReq);
    expect(promoteRes.status).toBe(404);
  });
});
