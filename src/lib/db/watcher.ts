import * as fs from "node:fs";
import * as path from "node:path";
import { EventEmitter } from "node:events";
import { getDatabasePath } from "./config";

export class DatabaseWatcher {
  private emitter = new EventEmitter();
  private watcher: fs.FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private currentDbPath: string | null = null;
  private debounceMs: number;

  constructor(debounceMs = 300) {
    this.debounceMs = debounceMs;
    this.emitter.setMaxListeners(100);
  }

  start(customPath?: string): void {
    const dbPath = customPath || getDatabasePath();
    if (dbPath === ":memory:") return;

    if (this.watcher && this.currentDbPath === dbPath) {
      return;
    }

    this.stop();

    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const baseDb = path.basename(dbPath);
    const walFile = `${baseDb}-wal`;

    try {
      this.watcher = fs.watch(dir, (eventType, filename) => {
        if (!filename) return;
        const name = filename.toString();
        // Ignore read-only shared memory index files (-shm) updated by read operations
        if (name.endsWith("-shm")) return;

        // Watch specifically for the database file or write-ahead log (-wal)
        if (name === baseDb || name === walFile) {
          this.triggerDebouncedChange();
        }
      });
      this.currentDbPath = dbPath;
    } catch (err) {
      // In constrained environments, logging or gracefully ignoring watch errors
      console.warn("[DatabaseWatcher] Failed to start fs.watch:", err);
      this.watcher = null;
      this.currentDbPath = null;
    }
  }

  private triggerDebouncedChange(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.emitter.emit("change");
      this.debounceTimer = null;
    }, this.debounceMs);
  }

  onChange(callback: () => void): () => void {
    this.emitter.on("change", callback);
    return () => {
      this.emitter.off("change", callback);
    };
  }

  notifyChange(): void {
    this.triggerDebouncedChange();
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch {}
      this.watcher = null;
    }
    this.currentDbPath = null;
  }
}

export const dbWatcher = new DatabaseWatcher(300);
