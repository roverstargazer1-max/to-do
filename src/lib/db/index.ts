import Database from "better-sqlite3";
import { getDatabasePath, ensureDatabaseDir } from "./config";
import { runMigrations } from "./migrator";

let dbInstance: Database.Database | null = null;
let currentPath: string | null = null;

export function getDatabase(customPath?: string): Database.Database {
  const targetPath = customPath || getDatabasePath();

  if (dbInstance) {
    if (currentPath === targetPath && dbInstance.open) {
      return dbInstance;
    }
    // If a different path is requested or connection is closed, close existing
    try {
      dbInstance.close();
    } catch {}
    dbInstance = null;
    currentPath = null;
  }

  ensureDatabaseDir(targetPath);

  const db = new Database(targetPath, {
    // verbose: process.env.NODE_ENV === "development" ? console.log : undefined,
  });

  // Core SQLite configuration for high concurrency & robustness
  if (targetPath !== ":memory:") {
    db.pragma("journal_mode = WAL;");
  }
  db.pragma("busy_timeout = 5000;");
  db.pragma("synchronous = NORMAL;");
  db.pragma("foreign_keys = ON;");

  // Run schema migrations automatically
  runMigrations(db);

  dbInstance = db;
  currentPath = targetPath;

  return db;
}

export function closeDatabase(): void {
  if (dbInstance) {
    try {
      if (dbInstance.open) {
        dbInstance.close();
      }
    } catch {}
    dbInstance = null;
    currentPath = null;
  }
}

/**
 * Compact database memory cache by instructing SQLite to release unused page cache pages
 * back to the operating system via PRAGMA shrink_memory.
 */
export function compactDatabaseMemory(customPath?: string): void {
  try {
    const db = getDatabase(customPath);
    if (db.open) {
      db.pragma("shrink_memory;");
    }
  } catch {}
}

export type { Database };
