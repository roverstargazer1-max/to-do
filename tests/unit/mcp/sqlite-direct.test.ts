import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { getDatabase, closeDatabase } from "@/lib/db/index";
import { ProjectRepository } from "@/lib/db/repositories/project-repository";
import { WorkspaceRepository } from "@/lib/db/repositories/workspace-repository";
import { createKagelinMcpServer } from "../../../mcp-server/server";

function responseData(response: any): Record<string, any> {
  return JSON.parse(response.content[0].text) as Record<string, any>;
}

describe("06: MCP Server SQLite Native Direct-Connect", () => {
  let tempDir: string;
  let testDbPath: string;
  let server: ReturnType<typeof createKagelinMcpServer>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kagelin-mcp-test-"));
    testDbPath = path.join(tempDir, "data.db");
    const db = getDatabase(testDbPath);

    server = createKagelinMcpServer({
      db,
      dbPath: testDbPath,
      useMockFallback: false,
    });
  });

  afterEach(() => {
    closeDatabase();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("registers SQLite tools: query_tasks, create_task, inspect_workspace, execute_sql", () => {
    const tools = (server as any)._registeredTools;
    expect(tools.query_tasks).toBeDefined();
    expect(tools.create_task).toBeDefined();
    expect(tools.inspect_workspace).toBeDefined();
    expect(tools.execute_sql).toBeDefined();
  });

  it("creates tasks via MCP tool create_task and queries them with query_tasks", async () => {
    const tools = (server as any)._registeredTools;

    // Create a task
    const createRes = await tools.create_task.handler({
      content: "MCP AI Agent Task",
      priority: 1,
      due_date: "2026-09-25T12:00:00.000Z",
    });
    const created = responseData(createRes);
    expect(created.task).toBeDefined();
    expect(created.task.content).toBe("MCP AI Agent Task");
    expect(created.task.priority).toBe(1);

    // Create second task with priority 4
    await tools.create_task.handler({
      content: "Low Priority Background Task",
      priority: 4,
    });

    // Query tasks filtered by priority 1
    const p1QueryRes = await tools.query_tasks.handler({ priority: 1 });
    const p1Data = responseData(p1QueryRes);
    expect(p1Data.count).toBe(1);
    expect(p1Data.tasks[0].content).toBe("MCP AI Agent Task");

    // Query all tasks
    const allQueryRes = await tools.query_tasks.handler({});
    const allData = responseData(allQueryRes);
    expect(allData.count).toBe(2);
  });

  it("inspects workspace canvas nodes and edges via inspect_workspace", async () => {
    const db = getDatabase(testDbPath);
    const wsRepo = new WorkspaceRepository(db);

    const ws = wsRepo.createWorkspace({ name: "AI Architecture" });
    const n1 = wsRepo.createNode({
      workspace_id: ws.id,
      kind: "task",
      position_x: 10,
      position_y: 20,
    });
    const n2 = wsRepo.createNode({
      workspace_id: ws.id,
      kind: "doc",
      position_x: 200,
      position_y: 20,
    });
    wsRepo.createEdge({
      workspace_id: ws.id,
      source_node_id: n1.id,
      target_node_id: n2.id,
    });

    const tools = (server as any)._registeredTools;
    const res = await tools.inspect_workspace.handler({ workspaceId: ws.id });
    const data = responseData(res);

    expect(data.workspace.name).toBe("AI Architecture");
    expect(data.nodes.length).toBe(2);
    expect(data.edges.length).toBe(1);
    expect(data.edges[0].source_node_id).toBe(n1.id);
  });

  it("executes read-only SQL queries and blocks mutating statements", async () => {
    const tools = (server as any)._registeredTools;

    // Insert a task first
    await tools.create_task.handler({ content: "SQL Queryable Task" });

    // Read-only query
    const selectRes = await tools.execute_sql.handler({
      sql: "SELECT count(*) as total, content FROM tasks WHERE content LIKE '%SQL%'",
    });
    const selectData = responseData(selectRes);
    expect(selectData.rowCount).toBe(1);
    expect(selectData.rows[0].total).toBe(1);

    // Mutating queries must be blocked
    const dropRes = await tools.execute_sql.handler({
      sql: "DROP TABLE tasks",
    });
    expect(dropRes.isError).toBe(true);
    const dropData = responseData(dropRes);
    expect(dropData.error.message).toContain("read-only");

    const deleteRes = await tools.execute_sql.handler({
      sql: "DELETE FROM tasks",
    });
    expect(deleteRes.isError).toBe(true);
  });
});
