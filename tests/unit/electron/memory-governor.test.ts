import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  MemoryGovernor,
  type MemoryGovernorWindow,
  type MemoryGovernorProcess,
} from "../../../electron/memory-governor";

describe("MemoryGovernor lifecycle and multi-tier purging", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  function createMockWindow() {
    const listeners: Record<string, (() => void)[]> = {};
    const mockCleanUpFreeList = vi.fn();
    const mockClearCache = vi.fn().mockResolvedValue(undefined);
    const mockExecuteJavaScript = vi.fn().mockResolvedValue(undefined);

    const win: MemoryGovernorWindow = {
      isDestroyed: vi.fn().mockReturnValue(false),
      on: vi.fn((event: string, cb: () => void) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);
      }),
      removeListener: vi.fn((event: string, cb: () => void) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((fn) => fn !== cb);
        }
      }),
      webContents: {
        cleanUpFreeList: mockCleanUpFreeList,
        executeJavaScript: mockExecuteJavaScript,
        session: {
          clearCache: mockClearCache,
        },
      },
    };

    const emit = (event: string) => {
      if (listeners[event]) {
        for (const cb of listeners[event]) cb();
      }
    };

    return {
      win,
      emit,
      mockCleanUpFreeList,
      mockClearCache,
      mockExecuteJavaScript,
    };
  }

  function createMockServerProcess(): MemoryGovernorProcess & {
    mockSend: ReturnType<typeof vi.fn>;
  } {
    const mockSend = vi.fn().mockReturnValue(true);
    return {
      killed: false,
      send: mockSend,
      mockSend,
    };
  }

  it("triggers immediate compaction on window minimize", async () => {
    const { win, emit, mockCleanUpFreeList, mockExecuteJavaScript } =
      createMockWindow();
    const serverProc = createMockServerProcess();
    const logger = vi.fn();
    const onCompactDatabase = vi.fn();

    let rss = 500 * 1024 * 1024;
    const governor = new MemoryGovernor({
      logger,
      getMemoryUsage: () => {
        rss -= 50 * 1024 * 1024;
        return { rss };
      },
      onCompactDatabase,
    });

    governor.attach(win, serverProc);

    emit("minimize");

    // Advance time for the async settlement delay (80ms)
    await vi.advanceTimersByTimeAsync(100);

    expect(mockCleanUpFreeList).toHaveBeenCalledTimes(1);
    expect(mockExecuteJavaScript).toHaveBeenCalledWith(
      expect.stringContaining("window.gc()"),
    );
    expect(serverProc.mockSend).toHaveBeenCalledWith({
      type: "compact-memory",
    });
    expect(onCompactDatabase).toHaveBeenCalledTimes(1);
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining("[Memory] Compacted (minimize):"),
    );
  });

  it("triggers immediate compaction on window hide", async () => {
    const { win, emit, mockCleanUpFreeList, mockExecuteJavaScript } =
      createMockWindow();
    const serverProc = createMockServerProcess();
    const logger = vi.fn();

    const governor = new MemoryGovernor({
      logger,
      getMemoryUsage: () => ({ rss: 300 * 1024 * 1024 }),
    });

    governor.attach(win, serverProc);

    emit("hide");
    await vi.advanceTimersByTimeAsync(100);

    expect(mockCleanUpFreeList).toHaveBeenCalledTimes(1);
    expect(mockExecuteJavaScript).toHaveBeenCalledTimes(1);
    expect(serverProc.mockSend).toHaveBeenCalledWith({
      type: "compact-memory",
    });
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining("[Memory] Compacted (hide):"),
    );
  });

  it("debounces window blur by 30 seconds before executing compaction", async () => {
    const { win, emit, mockCleanUpFreeList } = createMockWindow();
    const serverProc = createMockServerProcess();
    const logger = vi.fn();

    const governor = new MemoryGovernor({
      blurDebounceMs: 30_000,
      logger,
      getMemoryUsage: () => ({ rss: 400 * 1024 * 1024 }),
    });

    governor.attach(win, serverProc);

    emit("blur");
    expect(governor.isDebouncePending()).toBe(true);

    // After 15 seconds, compaction should not have run yet
    await vi.advanceTimersByTimeAsync(15_000);
    expect(mockCleanUpFreeList).not.toHaveBeenCalled();
    expect(governor.isDebouncePending()).toBe(true);

    // Advance past the 30-second mark + settle time
    await vi.advanceTimersByTimeAsync(15_100);

    expect(mockCleanUpFreeList).toHaveBeenCalledTimes(1);
    expect(serverProc.mockSend).toHaveBeenCalledWith({
      type: "compact-memory",
    });
    expect(governor.isDebouncePending()).toBe(false);
  });

  it("cancels pending blur debounce when focus is regained before 30 seconds", async () => {
    const { win, emit, mockCleanUpFreeList } = createMockWindow();
    const serverProc = createMockServerProcess();

    const governor = new MemoryGovernor({
      blurDebounceMs: 30_000,
      getMemoryUsage: () => ({ rss: 400 * 1024 * 1024 }),
    });

    governor.attach(win, serverProc);

    emit("blur");
    expect(governor.isDebouncePending()).toBe(true);

    // User switches back after 5 seconds
    await vi.advanceTimersByTimeAsync(5_000);
    emit("focus");

    expect(governor.isDebouncePending()).toBe(false);

    // Fast-forward past 60 seconds
    await vi.advanceTimersByTimeAsync(60_000);

    // Compaction should NEVER have fired
    expect(mockCleanUpFreeList).not.toHaveBeenCalled();
    expect(serverProc.mockSend).not.toHaveBeenCalled();
  });

  it("cancels pending blur debounce when window is restored or shown", async () => {
    const { win, emit } = createMockWindow();
    const governor = new MemoryGovernor({
      blurDebounceMs: 30_000,
      getMemoryUsage: () => ({ rss: 400 * 1024 * 1024 }),
    });

    governor.attach(win);

    emit("blur");
    expect(governor.isDebouncePending()).toBe(true);

    emit("restore");
    expect(governor.isDebouncePending()).toBe(false);

    emit("blur");
    expect(governor.isDebouncePending()).toBe(true);

    emit("show");
    expect(governor.isDebouncePending()).toBe(false);
  });

  it("safely handles detachment and prevents memory leaks", () => {
    const { win, emit } = createMockWindow();
    const governor = new MemoryGovernor();

    governor.attach(win);
    emit("blur");
    expect(governor.isDebouncePending()).toBe(true);

    governor.detach();
    expect(governor.isDebouncePending()).toBe(false);
  });
});
