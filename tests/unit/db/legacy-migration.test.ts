import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NextRequest } from "next/server";
import { getDatabase, closeDatabase } from "@/lib/db/index";
import { POST as postMigrateLegacy } from "@/../app/api/db/migrate-legacy/route";

describe("05: Silent Legacy Data Migration (IndexedDB/localStorage to SQLite)", () => {
  let tempDir: string;
  let testDbPath: string;
  let testAssetsDir: string;
  let originalDbEnv: string | undefined;
  let originalAssetEnv: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kagelin-migration-test-"));
    testDbPath = path.join(tempDir, "data.db");
    testAssetsDir = path.join(tempDir, "assets");
    originalDbEnv = process.env.KAGELIN_DB_PATH;
    originalAssetEnv = process.env.KAGELIN_ASSETS_PATH;
    process.env.KAGELIN_DB_PATH = testDbPath;
    process.env.KAGELIN_ASSETS_PATH = testAssetsDir;
  });

  afterEach(() => {
    closeDatabase();
    if (originalDbEnv) process.env.KAGELIN_DB_PATH = originalDbEnv;
    else delete process.env.KAGELIN_DB_PATH;
    if (originalAssetEnv) process.env.KAGELIN_ASSETS_PATH = originalAssetEnv;
    else delete process.env.KAGELIN_ASSETS_PATH;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("migrates full legacy guest data and workspace payload into SQLite in a single transaction", async () => {
    const legacyPayload = {
      guestData: {
        projects: [
          {
            id: "legacy-p1",
            name: "Legacy Project",
            color: "#6366f1",
            view_style: "list" as const,
            is_inbox: false,
            is_archived: false,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
            user_id: "guest",
          },
        ],
        tasks: [
          {
            id: "legacy-t1",
            content: "Legacy Task 1",
            priority: 1 as const,
            project_id: "legacy-p1",
            parent_id: null,
            is_completed: false,
            day_order: 0,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
            user_id: "guest",
          },
        ],
        habits: [
          {
            id: "legacy-h1",
            name: "Morning Reading",
            color: "#4B6CB7",
            sort_order: 0,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
            user_id: "guest",
          },
        ],
        habit_entries: [
          {
            id: "legacy-he1",
            habit_id: "legacy-h1",
            date: "2026-01-02",
            value: 1,
            created_at: "2026-01-02T00:00:00.000Z",
          },
        ],
        events: [
          {
            id: "legacy-ev1",
            title: "Doctor Appointment",
            start_time: "2026-01-05T10:00:00.000Z",
            end_time: "2026-01-05T11:00:00.000Z",
            all_day: false,
            color: "#4B6CB7",
            is_archived: false,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
            user_id: "guest",
          },
        ],
      },
      workspaceData: {
        workspaces: [
          {
            id: "legacy-ws1",
            name: "Main Canvas",
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
            user_id: "guest",
          },
        ],
        nodes: [
          {
            id: "legacy-node1",
            workspace_id: "legacy-ws1",
            kind: "task",
            position_x: 100,
            position_y: 200,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
            user_id: "guest",
          },
        ],
      },
      visualAssets: [
        {
          fileName: "legacy-diagram.png",
          mimeType: "image/png",
          base64: Buffer.from("legacy-image-content").toString("base64"),
        },
      ],
    };

    // Run migration via POST /api/db/migrate-legacy
    const req = new NextRequest("http://localhost:3000/api/db/migrate-legacy", {
      method: "POST",
      body: JSON.stringify(legacyPayload),
    });
    const res = await postMigrateLegacy(req);
    expect(res.status).toBe(200);

    // Verify records exist in SQLite
    const db = getDatabase(testDbPath);

    const projectRow = db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get("legacy-p1") as any;
    expect(projectRow).toBeDefined();
    expect(projectRow.name).toBe("Legacy Project");

    const taskRow = db
      .prepare("SELECT * FROM tasks WHERE id = ?")
      .get("legacy-t1") as any;
    expect(taskRow).toBeDefined();
    expect(taskRow.content).toBe("Legacy Task 1");

    const habitRow = db
      .prepare("SELECT * FROM habits WHERE id = ?")
      .get("legacy-h1") as any;
    expect(habitRow).toBeDefined();

    const entryRow = db
      .prepare("SELECT * FROM habit_entries WHERE habit_id = ?")
      .get("legacy-h1") as any;
    expect(entryRow).toBeDefined();
    expect(entryRow.date).toBe("2026-01-02");

    const eventRow = db
      .prepare("SELECT * FROM calendar_events WHERE id = ?")
      .get("legacy-ev1") as any;
    expect(eventRow).toBeDefined();

    const wsRow = db
      .prepare("SELECT * FROM workspaces WHERE id = ?")
      .get("legacy-ws1") as any;
    expect(wsRow).toBeDefined();

    const nodeRow = db
      .prepare("SELECT * FROM workspace_nodes WHERE id = ?")
      .get("legacy-node1") as any;
    expect(nodeRow).toBeDefined();

    const assetRow = db.prepare("SELECT * FROM visual_assets").get() as any;
    expect(assetRow).toBeDefined();
    expect(assetRow.file_name).toBe("legacy-diagram.png");

    // Idempotency: run migration again, must succeed without duplicates
    const req2 = new NextRequest(
      "http://localhost:3000/api/db/migrate-legacy",
      {
        method: "POST",
        body: JSON.stringify(legacyPayload),
      },
    );
    const res2 = await postMigrateLegacy(req2);
    expect(res2.status).toBe(200);

    const taskCount = (
      db
        .prepare("SELECT count(*) as c FROM tasks WHERE id = 'legacy-t1'")
        .get() as any
    ).c;
    expect(taskCount).toBe(1);
  });

  it("performs clean mirror restore when replace: true, removing stale records and preventing duplicates", async () => {
    const db = getDatabase(testDbPath);

    // 1. Seed existing local records that should NOT be in the restored data
    db.prepare(
      `
      INSERT INTO calendar_events (id, user_id, title, start_time, end_time, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      "local-stale-ev",
      "local_user",
      "Local Stale Event",
      "2026-05-01T10:00:00Z",
      "2026-05-01T11:00:00Z",
      new Date().toISOString(),
      new Date().toISOString(),
    );

    db.prepare(
      `
      INSERT INTO tasks (id, user_id, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    ).run(
      "local-stale-task",
      "local_user",
      "Local Stale Task",
      new Date().toISOString(),
      new Date().toISOString(),
    );

    expect(
      db.prepare("SELECT count(*) as c FROM calendar_events").get() as any,
    ).toMatchObject({ c: 1 });
    expect(
      db.prepare("SELECT count(*) as c FROM tasks").get() as any,
    ).toMatchObject({ c: 1 });

    // 2. Perform restore with replace: true and incoming remote payload
    const remotePayload = {
      replace: true,
      createSnapshot: true,
      guestData: {
        events: [
          {
            id: "remote-ev-1",
            title: "Remote Sync Event",
            start_time: "2026-05-01T10:00:00Z",
            end_time: "2026-05-01T11:00:00Z",
            all_day: false,
            color: "#4B6CB7",
            user_id: "local_user",
          },
        ],
        tasks: [
          {
            id: "remote-task-1",
            content: "Remote Sync Task",
            user_id: "local_user",
            priority: 2,
            is_completed: false,
          },
        ],
      },
    };

    const req = new NextRequest("http://localhost:3000/api/db/migrate-legacy", {
      method: "POST",
      body: JSON.stringify(remotePayload),
    });
    const res = await postMigrateLegacy(req);
    expect(res.status).toBe(200);

    // 3. Verify that old local records were replaced without duplication
    const allEvents = db
      .prepare("SELECT * FROM calendar_events")
      .all() as any[];
    expect(allEvents.length).toBe(1);
    expect(allEvents[0].id).toBe("remote-ev-1");
    expect(allEvents[0].title).toBe("Remote Sync Event");

    const allTasks = db.prepare("SELECT * FROM tasks").all() as any[];
    expect(allTasks.length).toBe(1);
    expect(allTasks[0].id).toBe("remote-task-1");

    // 4. Verify auto-snapshot was created in snapshots directory
    const snapshotsDir = path.join(path.dirname(testDbPath), "snapshots");
    expect(fs.existsSync(snapshotsDir)).toBe(true);
    const files = fs.readdirSync(snapshotsDir);
    expect(files.some((f) => f.startsWith("auto-backup-"))).toBe(true);
  });
});
