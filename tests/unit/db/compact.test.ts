import { describe, expect, it, afterEach } from "vitest";
import {
  getDatabase,
  closeDatabase,
  compactDatabaseMemory,
} from "@/lib/db/index";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

describe("SQLite database memory compaction", () => {
  const testDbDir = path.join(
    os.tmpdir(),
    `kagelin-compact-test-${Date.now()}`,
  );
  const testDbPath = path.join(testDbDir, "test.db");

  afterEach(() => {
    closeDatabase();
    try {
      if (fs.existsSync(testDbDir)) {
        fs.rmSync(testDbDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it("successfully executes PRAGMA shrink_memory on active database", () => {
    const db = getDatabase(testDbPath);
    expect(db.open).toBe(true);

    // Populate some data to allocate page cache
    db.exec(`
      CREATE TABLE IF NOT EXISTS sample_items (id TEXT PRIMARY KEY, value TEXT);
      INSERT INTO sample_items (id, value) VALUES ('1', 'hello'), ('2', 'world');
    `);

    expect(() => {
      compactDatabaseMemory(testDbPath);
    }).not.toThrow();
  });

  it("does not throw when database path is invalid or unopenable", () => {
    expect(() => {
      compactDatabaseMemory("/invalid/non/existent/path/db.sqlite");
    }).not.toThrow();
  });
});
