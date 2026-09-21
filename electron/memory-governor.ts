import type { BrowserWindow } from "electron";
import type { ChildProcess } from "node:child_process";

export interface MemoryGovernorWindow {
  isDestroyed(): boolean;
  on(
    event: "blur" | "focus" | "minimize" | "restore" | "hide" | "show",
    listener: () => void,
  ): void;
  removeListener?(
    event: "blur" | "focus" | "minimize" | "restore" | "hide" | "show",
    listener: () => void,
  ): void;
  webContents?: {
    cleanUpFreeList?: () => void;
    executeJavaScript(code: string): Promise<unknown>;
    session?: {
      clearCache(): Promise<void>;
    };
  };
}

export interface MemoryGovernorProcess {
  killed?: boolean;
  send?: (message: unknown) => boolean | void;
}

export interface MemoryGovernorOptions {
  blurDebounceMs?: number;
  logger?: (msg: string) => void;
  getMemoryUsage?: () => { rss: number };
  onCompactDatabase?: () => void;
}

export interface CompactionResult {
  beforeRss: number;
  afterRss: number;
  freedBytes: number;
}

export const DEFAULT_BLUR_DEBOUNCE_MS = 30_000; // 30 seconds

export class MemoryGovernor {
  private blurDebounceMs: number;
  private logger: (msg: string) => void;
  private getMemoryUsage: () => { rss: number };
  private onCompactDatabase?: () => void;

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private attachedWindow: MemoryGovernorWindow | null = null;
  private attachedServerProcess: MemoryGovernorProcess | null = null;
  private isCompacting = false;

  private onBlurBound = () => this.handleBlur();
  private onFocusBound = () => this.handleFocus();
  private onMinimizeBound = () => this.handleImmediateCompaction("minimize");
  private onHideBound = () => this.handleImmediateCompaction("hide");
  private onRestoreBound = () => this.handleFocus();
  private onShowBound = () => this.handleFocus();

  constructor(options: MemoryGovernorOptions = {}) {
    this.blurDebounceMs = options.blurDebounceMs ?? DEFAULT_BLUR_DEBOUNCE_MS;
    this.logger = options.logger ?? console.log;
    this.getMemoryUsage =
      options.getMemoryUsage ?? (() => ({ rss: process.memoryUsage().rss }));
    this.onCompactDatabase = options.onCompactDatabase;
  }

  public attach(
    window: MemoryGovernorWindow | BrowserWindow,
    serverProcess?: MemoryGovernorProcess | ChildProcess | null,
  ): void {
    this.detach();

    this.attachedWindow = window as MemoryGovernorWindow;
    this.attachedServerProcess = serverProcess as MemoryGovernorProcess | null;

    window.on("blur", this.onBlurBound);
    window.on("focus", this.onFocusBound);
    window.on("minimize", this.onMinimizeBound);
    window.on("hide", this.onHideBound);
    window.on("restore", this.onRestoreBound);
    window.on("show", this.onShowBound);
  }

  public detach(): void {
    this.cancelDebounce();

    if (this.attachedWindow && this.attachedWindow.removeListener) {
      try {
        this.attachedWindow.removeListener("blur", this.onBlurBound);
        this.attachedWindow.removeListener("focus", this.onFocusBound);
        this.attachedWindow.removeListener("minimize", this.onMinimizeBound);
        this.attachedWindow.removeListener("hide", this.onHideBound);
        this.attachedWindow.removeListener("restore", this.onRestoreBound);
        this.attachedWindow.removeListener("show", this.onShowBound);
      } catch {}
    }

    this.attachedWindow = null;
    this.attachedServerProcess = null;
  }

  public setServerProcess(
    serverProcess: MemoryGovernorProcess | ChildProcess | null,
  ): void {
    this.attachedServerProcess = serverProcess as MemoryGovernorProcess | null;
  }

  public isDebouncePending(): boolean {
    return this.debounceTimer !== null;
  }

  public cancelDebounce(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  public scheduleDebouncedCompaction(): void {
    this.cancelDebounce();
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.triggerCompaction("blur-debounced").catch((err) => {
        this.logger(`[Memory] Compaction error: ${String(err)}`);
      });
    }, this.blurDebounceMs);
  }

  private handleBlur(): void {
    this.scheduleDebouncedCompaction();
  }

  private handleFocus(): void {
    this.cancelDebounce();
  }

  private handleImmediateCompaction(source: "minimize" | "hide"): void {
    this.cancelDebounce();
    this.triggerCompaction(source).catch((err) => {
      this.logger(`[Memory] Compaction error: ${String(err)}`);
    });
  }

  public async triggerCompaction(source = "manual"): Promise<CompactionResult> {
    if (this.isCompacting) {
      const currentRss = this.getMemoryUsage().rss;
      return { beforeRss: currentRss, afterRss: currentRss, freedBytes: 0 };
    }

    this.isCompacting = true;
    const beforeRss = this.getMemoryUsage().rss;

    try {
      // 1. Chromium native FreeList reclamation and session cache clearing
      if (this.attachedWindow && !this.attachedWindow.isDestroyed()) {
        const webContents = this.attachedWindow.webContents;
        if (webContents) {
          if (typeof webContents.cleanUpFreeList === "function") {
            try {
              webContents.cleanUpFreeList();
            } catch {}
          }
          if (webContents.session) {
            webContents.session.clearCache().catch(() => {});
          }

          // 2. Renderer process V8 heap compaction
          webContents
            .executeJavaScript(
              "if (typeof window.gc === 'function') { window.gc(); }",
            )
            .catch(() => {});
        }
      }

      // 3. Standalone child process IPC garbage collection & SQLite cache compaction
      if (
        this.attachedServerProcess &&
        !this.attachedServerProcess.killed &&
        typeof this.attachedServerProcess.send === "function"
      ) {
        try {
          this.attachedServerProcess.send({ type: "compact-memory" });
        } catch {}
      }

      // 4. Local SQLite database memory compaction if attached
      if (typeof this.onCompactDatabase === "function") {
        try {
          this.onCompactDatabase();
        } catch {}
      }

      // Allow V8 minor pause to settle before reading after-RSS
      await new Promise((resolve) => setTimeout(resolve, 80));

      const afterRss = this.getMemoryUsage().rss;
      const freedBytes = Math.max(0, beforeRss - afterRss);

      const beforeMB = (beforeRss / (1024 * 1024)).toFixed(1);
      const afterMB = (afterRss / (1024 * 1024)).toFixed(1);
      const freedMB = (freedBytes / (1024 * 1024)).toFixed(1);

      this.logger(
        `[Memory] Compacted (${source}): before=${beforeMB} MB, after=${afterMB} MB, freed=${freedMB} MB`,
      );

      return { beforeRss, afterRss, freedBytes };
    } finally {
      this.isCompacting = false;
    }
  }
}
