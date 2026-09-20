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

export type { Database };
