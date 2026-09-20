import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NextRequest } from "next/server";
import { closeDatabase, getDatabase } from "@/lib/db/index";
import { POST as postWipe } from "@/../app/api/db/wipe/route";
import { POST as postTasks } from "@/../app/api/db/tasks/route";
import { POST as postWorkspaces } from "@/../app/api/db/workspaces/route";
import { POST as postAssets } from "@/../app/api/assets/route";

describe("API route: wipe local data", () => {
  let tempDir: string;
  let testDbPath: string;
  let assetsDir: string;
  let originalDbEnv: string | undefined;
  let originalAssetsEnv: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kagelin-wipe-test-"));
    testDbPath = path.join(tempDir, "data.db");
    assetsDir = path.join(tempDir, "assets");
    originalDbEnv = process.env.KAGELIN_DB_PATH;
    originalAssetsEnv = process.env.KAGELIN_ASSETS_PATH;
    process.env.KAGELIN_DB_PATH = testDbPath;
    process.env.KAGELIN_ASSETS_PATH = assetsDir;
  });

  afterEach(() => {
    closeDatabase();
    if (originalDbEnv) process.env.KAGELIN_DB_PATH = originalDbEnv;
    else delete process.env.KAGELIN_DB_PATH;
    if (originalAssetsEnv) process.env.KAGELIN_ASSETS_PATH = originalAssetsEnv;
    else delete process.env.KAGELIN_ASSETS_PATH;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("clears every domain table and deletes the local asset files", async () => {
    const db = getDatabase(testDbPath);

    await postTasks(
      new NextRequest("http://localhost:3000/api/db/tasks", {
        method: "POST",
        body: JSON.stringify({ content: "Wipe me" }),
      }),
    );
    await postWorkspaces(
      new NextRequest("http://localhost:3000/api/db/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: "Wipe canvas" }),
      }),
    );
    await postAssets(
      new NextRequest("http://localhost:3000/api/assets", {
        method: "POST",
        body: JSON.stringify({
          base64: Buffer.from("wipe-pixel").toString("base64"),
          fileName: "wipe.png",
          mimeType: "image/png",
        }),
      }),
    );

    expect(
      (db.prepare("SELECT count(*) as c FROM tasks").get() as { c: number }).c,
    ).toBeGreaterThan(0);
    expect(fs.readdirSync(assetsDir).length).toBe(1);

    const res = await postWipe();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    for (const table of [
      "tasks",
      "projects",
      "habits",
      "habit_entries",
      "focus_logs",
      "calendar_events",
      "workspaces",
      "workspace_nodes",
      "workspace_edges",
      "visual_assets",
      "visual_asset_versions",
      "visual_annotations",
      "visual_derived",
      "visual_relations",
      "visual_flow_drafts",
    ]) {
      const count = (
        db.prepare(`SELECT count(*) as c FROM ${table}`).get() as { c: number }
      ).c;
      expect(count, `${table} should be empty`).toBe(0);
    }

    expect(fs.readdirSync(assetsDir)).toEqual([]);
  });
});
