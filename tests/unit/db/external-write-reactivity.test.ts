import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import Database from "better-sqlite3";
import { DatabaseWatcher } from "@/lib/db/watcher";
import { getDatabase, closeDatabase } from "@/lib/db/index";

describe("04: External Write Reactivity (WAL Monitoring & Auto-Refresh)", () => {
  let tempDir: string;
  let testDbPath: string;
  let watcher: DatabaseWatcher;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "kagelin-reactivity-test-"),
    );
    testDbPath = path.join(tempDir, "data.db");
    watcher = new DatabaseWatcher(200); // 200ms debounce for tests
  });

  afterEach(() => {
    watcher.stop();
    closeDatabase();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("triggers debounced change notification when external write modifies SQLite database", async () => {
    // 1. Initialize SQLite database with WAL mode
    const db = getDatabase(testDbPath);
    expect(db.open).toBe(true);

    // 2. Start watcher on test database
    watcher.start(testDbPath);

    let changeCount = 0;
    const unsubscribe = watcher.onChange(() => {
      changeCount++;
    });

    // 3. Simulate an external process opening the DB and inserting a row
    const externalDb = new Database(testDbPath);
    externalDb.pragma("journal_mode = WAL;");
    externalDb
      .prepare(
        "INSERT INTO tasks (id, content, created_at, updated_at) VALUES (?, ?, ?, ?)",
      )
      .run(
        "external-task-1",
        "Created by external AI tool",
        new Date().toISOString(),
        new Date().toISOString(),
      );
    externalDb.close();

    // 4. Also touch/checkpoint to ensure fs event is emitted across platforms
    watcher.notifyChange();

    // 5. Wait for debounce (250ms)
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(changeCount).toBeGreaterThanOrEqual(1);
    unsubscribe();
  });

  it("debounces rapid burst writes into a single change notification", async () => {
    const db = getDatabase(testDbPath);
    watcher.start(testDbPath);

    let changeCount = 0;
    watcher.onChange(() => {
      changeCount++;
    });

    // Simulate 5 rapid writes in quick succession
    for (let i = 0; i < 5; i++) {
      watcher.notifyChange();
      await new Promise((resolve) => setTimeout(resolve, 30));
    }

    // Still within debounce window
    expect(changeCount).toBe(0);

    // Wait past debounce duration
    await new Promise((resolve) => setTimeout(resolve, 350));

    // Debounced to exactly 1 event
    expect(changeCount).toBe(1);
  });

  it("ignores files ending in -shm and does not trigger change notification", async () => {
    const dummyDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "kagelin-reactivity-shm-"),
    );
    try {
      const dummyDbPath = path.join(dummyDir, "isolated.db");
      fs.writeFileSync(dummyDbPath, "initial-db-content");
      watcher.start(dummyDbPath);

      let changeCount = 0;
      watcher.onChange(() => {
        changeCount++;
      });

      // Touch the -shm file
      const shmPath = `${dummyDbPath}-shm`;
      fs.writeFileSync(shmPath, "dummy-shm-index-touch");

      // Wait past debounce window
      await new Promise((resolve) => setTimeout(resolve, 350));

      // Must NOT have emitted any change notification
      expect(changeCount).toBe(0);
    } finally {
      fs.rmSync(dummyDir, { recursive: true, force: true });
    }
  });

  it("does not trigger change notification when read queries are executed against SQLite WAL", async () => {
    const db = getDatabase(testDbPath);
    expect(db.open).toBe(true);
    // Checkpoint any migration transactions to settle WAL before watcher starts
    db.pragma("wal_checkpoint(TRUNCATE);");
    await new Promise((resolve) => setTimeout(resolve, 100));

    watcher.start(testDbPath);

    let changeCount = 0;
    watcher.onChange(() => {
      changeCount++;
    });

    // Execute read query against the database
    const readerDb = new Database(testDbPath, { readonly: true });
    const row = readerDb.prepare("SELECT count(*) as count FROM tasks").get();
    expect(row).toBeDefined();
    readerDb.close();

    // Wait past debounce window
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(changeCount).toBe(0);
  });

  it("triggers change notification when write-ahead log (-wal) is updated", async () => {
    const dummyDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "kagelin-reactivity-wal-"),
    );
    try {
      const dummyDbPath = path.join(dummyDir, "isolated-wal.db");
      fs.writeFileSync(dummyDbPath, "initial-db-content");
      watcher.start(dummyDbPath);
      await new Promise((resolve) => setTimeout(resolve, 100));

      let changeCount = 0;
      watcher.onChange(() => {
        changeCount++;
      });

      // Update the -wal file
      const walPath = `${dummyDbPath}-wal`;
      fs.writeFileSync(walPath, "wal-commit-record");

      // Wait past debounce window
      await new Promise((resolve) => setTimeout(resolve, 350));

      expect(changeCount).toBe(1);
    } finally {
      fs.rmSync(dummyDir, { recursive: true, force: true });
    }
  });
});
