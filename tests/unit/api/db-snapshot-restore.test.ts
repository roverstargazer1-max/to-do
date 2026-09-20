import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NextRequest } from "next/server";
import { getDatabase, closeDatabase } from "@/lib/db/index";
import { GET as getSnapshot } from "@/../app/api/db/snapshot/route";
import { POST as postRestore } from "@/../app/api/db/restore/route";

describe("Database Snapshot & Restore Endpoints", () => {
  let tempDir: string;
  let testDbPath: string;
  let originalDbEnv: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kagelin-snapshot-test-"));
    testDbPath = path.join(tempDir, "data.db");
    originalDbEnv = process.env.KAGELIN_DB_PATH;
    process.env.KAGELIN_DB_PATH = testDbPath;
  });

  afterEach(() => {
    closeDatabase();
    if (originalDbEnv) process.env.KAGELIN_DB_PATH = originalDbEnv;
    else delete process.env.KAGELIN_DB_PATH;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("exports a valid SQLite snapshot via VACUUM INTO and restores from it", async () => {
    // 1. Insert seed data into database
    const db = getDatabase(testDbPath);
    db.prepare(
      "INSERT INTO tasks (id, content, created_at, updated_at) VALUES (?, ?, ?, ?)",
    ).run(
      "task-snap-1",
      "Task before snapshot",
      new Date().toISOString(),
      new Date().toISOString(),
    );

    // 2. Call GET /api/db/snapshot
    const snapReq = new NextRequest("http://localhost:3000/api/db/snapshot");
    const snapRes = await getSnapshot(snapReq);
    expect(snapRes.status).toBe(200);
    expect(snapRes.headers.get("content-type")).toBe("application/x-sqlite3");

    const snapshotBytes = await snapRes.arrayBuffer();
    expect(snapshotBytes.byteLength).toBeGreaterThan(0);
    const magic = Buffer.from(snapshotBytes).subarray(0, 16).toString("utf-8");
    expect(magic).toContain("SQLite format 3");

    // 3. Mutate the live database (insert another task)
    db.prepare(
      "INSERT INTO tasks (id, content, created_at, updated_at) VALUES (?, ?, ?, ?)",
    ).run(
      "task-snap-2",
      "Task after snapshot",
      new Date().toISOString(),
      new Date().toISOString(),
    );
    const countBeforeRestore = (
      db.prepare("SELECT count(*) as c FROM tasks").get() as any
    ).c;
    expect(countBeforeRestore).toBe(2);

    // 4. Restore the database from the earlier snapshot
    const base64Payload = Buffer.from(snapshotBytes).toString("base64");
    const restoreReq = new NextRequest("http://localhost:3000/api/db/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64: base64Payload }),
    });
    const restoreRes = await postRestore(restoreReq);
    expect(restoreRes.status).toBe(200);

    // 5. Query restored database: must contain task-snap-1, but not task-snap-2
    const restoredDb = getDatabase(testDbPath);
    const countAfterRestore = (
      restoredDb.prepare("SELECT count(*) as c FROM tasks").get() as any
    ).c;
    expect(countAfterRestore).toBe(1);

    const row = restoredDb
      .prepare("SELECT * FROM tasks WHERE id = ?")
      .get("task-snap-1") as any;
    expect(row.content).toBe("Task before snapshot");
  });
});
