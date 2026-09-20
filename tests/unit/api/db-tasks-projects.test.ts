import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NextRequest } from "next/server";
import { closeDatabase } from "@/lib/db/index";
import {
  GET as getProjects,
  POST as postProjects,
  DELETE as deleteProjects,
} from "@/../app/api/db/projects/route";
import {
  GET as getTasks,
  POST as postTasks,
  PATCH as patchTasks,
  DELETE as deleteTasks,
} from "@/../app/api/db/tasks/route";

describe("API Routes: /api/db/projects & /api/db/tasks", () => {
  let tempDir: string;
  let testDbPath: string;
  let originalDbPath: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kagelin-api-test-"));
    testDbPath = path.join(tempDir, "data.db");
    originalDbPath = process.env.KAGELIN_DB_PATH;
    process.env.KAGELIN_DB_PATH = testDbPath;
  });

  afterEach(() => {
    closeDatabase();
    if (originalDbPath) {
      process.env.KAGELIN_DB_PATH = originalDbPath;
    } else {
      delete process.env.KAGELIN_DB_PATH;
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("creates, lists, and deletes projects via /api/db/projects", async () => {
    // POST /api/db/projects
    const postReq = new NextRequest("http://localhost:3000/api/db/projects", {
      method: "POST",
      body: JSON.stringify({ name: "API Test Project", color: "#3b82f6" }),
    });
    const postRes = await postProjects(postReq);
    expect(postRes.status).toBe(201);
    const created = await postRes.json();
    expect(created.id).toBeDefined();
    expect(created.name).toBe("API Test Project");

    // GET /api/db/projects
    const getReq = new NextRequest("http://localhost:3000/api/db/projects");
    const getRes = await getProjects(getReq);
    expect(getRes.status).toBe(200);
    const list = await getRes.json();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(created.id);

    // DELETE /api/db/projects?id=...
    const delReq = new NextRequest(
      `http://localhost:3000/api/db/projects?id=${created.id}`,
      {
        method: "DELETE",
      },
    );
    const delRes = await deleteProjects(delReq);
    expect(delRes.status).toBe(200);
    const delJson = await delRes.json();
    expect(delJson.success).toBe(true);
  });

  it("handles full task lifecycle via /api/db/tasks", async () => {
    // POST /api/db/tasks
    const postReq = new NextRequest("http://localhost:3000/api/db/tasks", {
      method: "POST",
      body: JSON.stringify({ content: "API Task 1", priority: 1 }),
    });
    const postRes = await postTasks(postReq);
    expect(postRes.status).toBe(201);
    const task = await postRes.json();
    expect(task.id).toBeDefined();
    expect(task.content).toBe("API Task 1");

    // PATCH /api/db/tasks (toggle complete)
    const patchReq = new NextRequest("http://localhost:3000/api/db/tasks", {
      method: "PATCH",
      body: JSON.stringify({ id: task.id, action: "toggleComplete" }),
    });
    const patchRes = await patchTasks(patchReq);
    expect(patchRes.status).toBe(200);
    const toggled = await patchRes.json();
    expect(toggled.is_completed).toBe(true);

    // GET /api/db/tasks?showCompleted=true
    const getReq = new NextRequest(
      "http://localhost:3000/api/db/tasks?showCompleted=true",
    );
    const getRes = await getTasks(getReq);
    expect(getRes.status).toBe(200);
    const list = await getRes.json();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(task.id);

    // DELETE /api/db/tasks?id=...
    const delReq = new NextRequest(
      `http://localhost:3000/api/db/tasks?id=${task.id}`,
      {
        method: "DELETE",
      },
    );
    const delRes = await deleteTasks(delReq);
    expect(delRes.status).toBe(200);
  });
});
