import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import Database from "better-sqlite3";
import { getDatabase, closeDatabase } from "@/lib/db/index";
import { getDatabasePath, ensureDatabaseDir } from "@/lib/db/config";
import { runMigrations } from "@/lib/db/migrator";
import { ProjectRepository } from "@/lib/db/repositories/project-repository";
import { TaskRepository } from "@/lib/db/repositories/task-repository";

describe("01: SQLite Foundation & Tasks Vertical Slice", () => {
  let tempDir: string;
  let testDbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kagelin-test-"));
    testDbPath = path.join(tempDir, "test.db");
  });

  afterEach(() => {
    closeDatabase();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("configures SQLite with WAL, busy timeout, normal synchronous, and foreign keys", () => {
    const db = getDatabase(testDbPath);
    expect(db.open).toBe(true);

    const journalMode = db.pragma("journal_mode", { simple: true });
    expect(journalMode).toBe("wal");

    const busyTimeout = db.pragma("busy_timeout", { simple: true });
    expect(busyTimeout).toBe(5000);

    const synchronous = db.pragma("synchronous", { simple: true });
    // NORMAL synchronous pragma is 1 in SQLite
    expect(synchronous).toBe(1);

    const foreignKeys = db.pragma("foreign_keys", { simple: true });
    expect(foreignKeys).toBe(1);
  });

  it("resolves storage path according to environment and creates parent directory", () => {
    const customDb = path.join(tempDir, "nested", "folder", "custom.db");
    const resolved = ensureDatabaseDir(customDb);
    expect(resolved).toBe(customDb);
    expect(fs.existsSync(path.dirname(customDb))).toBe(true);

    const originalEnv = process.env.KAGELIN_DB_PATH;
    try {
      process.env.KAGELIN_DB_PATH = customDb;
      expect(getDatabasePath()).toBe(path.resolve(customDb));
    } finally {
      if (originalEnv) {
        process.env.KAGELIN_DB_PATH = originalEnv;
      } else {
        delete process.env.KAGELIN_DB_PATH;
      }
    }
  });

  it("runs schema migrations and updates user_version", () => {
    const rawDb = new Database(testDbPath);
    const initialVersion = rawDb.pragma("user_version", { simple: true });
    expect(initialVersion).toBe(0);

    const newVersion = runMigrations(rawDb);
    expect(newVersion).toBeGreaterThanOrEqual(1);

    const updatedVersion = rawDb.pragma("user_version", { simple: true });
    expect(updatedVersion).toBe(newVersion);
    rawDb.close();
  });

  it("performs full CRUD operations on projects", () => {
    const db = getDatabase(testDbPath);
    const projectRepo = new ProjectRepository(db);

    const created = projectRepo.create({
      name: "Work Project",
      color: "#ff0000",
      view_style: "board",
    });
    expect(created.id).toBeDefined();
    expect(created.name).toBe("Work Project");
    expect(created.color).toBe("#ff0000");
    expect(created.view_style).toBe("board");
    expect(created.is_archived).toBe(false);

    const fetched = projectRepo.getById(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe("Work Project");

    const updated = projectRepo.update(created.id, {
      name: "Work Project Updated",
      is_archived: true,
    });
    expect(updated?.name).toBe("Work Project Updated");
    expect(updated?.is_archived).toBe(true);

    const list = projectRepo.list();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(created.id);

    const deleted = projectRepo.delete(created.id);
    expect(deleted).toBe(true);
    expect(projectRepo.getById(created.id)).toBeNull();
  });

  it("performs full CRUD operations on tasks with priority and due date filtering", () => {
    const db = getDatabase(testDbPath);
    const projectRepo = new ProjectRepository(db);
    const taskRepo = new TaskRepository(db);

    const project = projectRepo.create({ name: "Personal" });

    // Create tasks
    const task1 = taskRepo.create({
      content: "Important Urgent Task",
      priority: 1,
      project_id: project.id,
      due_date: new Date().toISOString(),
    });
    expect(task1.id).toBeDefined();
    expect(task1.day_order).toBe(0);

    const task2 = taskRepo.create({
      content: "Normal Task",
      priority: 4,
      project_id: project.id,
    });
    expect(task2.day_order).toBe(1);

    // Toggle completion
    const toggled = taskRepo.toggleComplete(task1.id);
    expect(toggled?.is_completed).toBe(true);
    expect(toggled?.completed_at).toBeDefined();

    const untoggled = taskRepo.toggleComplete(task1.id);
    expect(untoggled?.is_completed).toBe(false);
    expect(untoggled?.completed_at).toBeNull();

    // Priority filter
    const p1Tasks = taskRepo.list({ filter: "p1" });
    expect(p1Tasks.length).toBe(1);
    expect(p1Tasks[0].id).toBe(task1.id);

    // Project filter
    const projectTasks = taskRepo.list({ projectId: project.id });
    expect(projectTasks.length).toBe(2);

    // Subtask support
    const subtask = taskRepo.create({
      content: "Subtask 1",
      parent_id: task1.id,
    });
    const parentWithSubtasks = taskRepo.getById(task1.id);
    expect(parentWithSubtasks?.subtasks?.length).toBe(1);
    expect(parentWithSubtasks?.subtasks?.[0].id).toBe(subtask.id);

    // Reordering
    taskRepo.reorder([task2.id, task1.id]);
    const reordered = taskRepo.list({ projectId: project.id });
    expect(reordered[0].id).toBe(task2.id);
    expect(reordered[1].id).toBe(task1.id);
  });

  it("enforces foreign key cascade deletes from projects and parent tasks", () => {
    const db = getDatabase(testDbPath);
    const projectRepo = new ProjectRepository(db);
    const taskRepo = new TaskRepository(db);

    const project = projectRepo.create({ name: "Temporary Project" });
    const parent = taskRepo.create({
      content: "Parent Task",
      project_id: project.id,
    });
    const subtask = taskRepo.create({
      content: "Child Subtask",
      project_id: project.id,
      parent_id: parent.id,
    });

    expect(taskRepo.getById(parent.id)).not.toBeNull();
    expect(taskRepo.getById(subtask.id)).not.toBeNull();

    // Deleting the parent task cascades to subtask
    taskRepo.delete(parent.id);
    expect(taskRepo.getById(parent.id)).toBeNull();
    expect(taskRepo.getById(subtask.id)).toBeNull();

    // Recreate task under project, then delete project
    const newTask = taskRepo.create({
      content: "Another Task",
      project_id: project.id,
    });
    expect(taskRepo.getById(newTask.id)).not.toBeNull();

    projectRepo.delete(project.id);
    expect(taskRepo.getById(newTask.id)).toBeNull();
  });
});
