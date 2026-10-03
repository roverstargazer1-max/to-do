import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { closeDatabase } from "@/lib/db/index";
import {
  POST as createTask,
  GET as listTasks,
} from "@/../app/api/db/tasks/route";
import { POST as restoreBackup } from "@/../app/api/db/migrate-legacy/route";

describe("Backup import recovery snapshot", () => {
  let directory: string;
  let previousPath: string | undefined;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "kagelin-backup-safety-"));
    previousPath = process.env.KAGELIN_DB_PATH;
    process.env.KAGELIN_DB_PATH = join(directory, "data.db");
  });
  afterEach(() => {
    closeDatabase();
    if (previousPath) process.env.KAGELIN_DB_PATH = previousPath;
    else delete process.env.KAGELIN_DB_PATH;
    rmSync(directory, { recursive: true, force: true });
  });
  it("leaves current data intact when the recovery snapshot cannot be created", async () => {
    const task = await (
      await createTask(
        new NextRequest("http://localhost:3000/api/db/tasks", {
          method: "POST",
          body: JSON.stringify({ content: "Keep this task" }),
        }),
      )
    ).json();
    // A file at the directory path deterministically prevents a snapshot write.
    writeFileSync(join(directory, "snapshots"), "not a directory");
    const response = await restoreBackup(
      new NextRequest("http://localhost:3000/api/db/migrate-legacy", {
        method: "POST",
        body: JSON.stringify({
          replace: true,
          createSnapshot: true,
          guestData: {
            tasks: [],
            projects: [],
            habits: [],
            habit_entries: [],
            focus_logs: [],
            events: [],
          },
        }),
      }),
    );
    expect(response.status).toBe(500);
    const rows = await (
      await listTasks(
        new NextRequest(
          "http://localhost:3000/api/db/tasks?showCompleted=true",
        ),
      )
    ).json();
    expect(rows).toEqual([task]);
  });
});
