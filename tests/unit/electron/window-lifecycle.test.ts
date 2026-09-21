import { describe, expect, it, vi } from "vitest";
import {
  setupWindowCloseHandler,
  handleAppActivate,
  handleSecondInstance,
  handleWindowAllClosed,
  handleBeforeQuit,
  type WindowLifecycleWindow,
} from "../../../electron/window-lifecycle";

function createMockWindow(
  overrides: Partial<WindowLifecycleWindow> = {},
): WindowLifecycleWindow & {
  listeners: Record<string, ((...args: unknown[]) => void)[]>;
  onceListeners: Record<string, ((...args: unknown[]) => void)[]>;
} {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const onceListeners: Record<string, ((...args: unknown[]) => void)[]> = {};

  return {
    listeners,
    onceListeners,
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    isFullScreen: vi.fn(() => false),
    setFullScreen: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    restore: vi.fn(),
    focus: vi.fn(),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(listener);
    }),
    once: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      onceListeners[event] = onceListeners[event] || [];
      onceListeners[event].push(listener);
    }),
    ...overrides,
  };
}

describe("setupWindowCloseHandler", () => {
  it("prevents close and hides window on macOS when not quitting", () => {
    const win = createMockWindow({
      isFullScreen: vi.fn(() => false),
    });
    const preventDefault = vi.fn();
    const isQuitting = false;

    setupWindowCloseHandler(win, () => isQuitting, "darwin");

    const closeHandler = win.listeners["close"]?.[0];
    expect(closeHandler).toBeDefined();

    closeHandler({ preventDefault });

    expect(preventDefault).toHaveBeenCalled();
    expect(win.hide).toHaveBeenCalled();
  });

  it("handles full-screen mode on macOS by exiting full screen before hiding", () => {
    const win = createMockWindow({
      isFullScreen: vi.fn(() => true),
    });
    const preventDefault = vi.fn();

    setupWindowCloseHandler(win, () => false, "darwin");

    const closeHandler = win.listeners["close"]?.[0];
    closeHandler({ preventDefault });

    expect(preventDefault).toHaveBeenCalled();
    expect(win.setFullScreen).toHaveBeenCalledWith(false);
    expect(win.hide).not.toHaveBeenCalled();

    // Trigger leave-full-screen
    const leaveHandler = win.onceListeners["leave-full-screen"]?.[0];
    expect(leaveHandler).toBeDefined();
    leaveHandler();

    expect(win.hide).toHaveBeenCalled();
  });

  it("does not prevent close or hide when quitting on macOS", () => {
    const win = createMockWindow();
    const preventDefault = vi.fn();

    setupWindowCloseHandler(win, () => true, "darwin");

    const closeHandler = win.listeners["close"]?.[0];
    closeHandler({ preventDefault });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(win.hide).not.toHaveBeenCalled();
  });

  it("does not prevent close or hide on non-darwin platforms (Windows/Linux)", () => {
    const win = createMockWindow();
    const preventDefault = vi.fn();

    setupWindowCloseHandler(win, () => false, "win32");

    const closeHandler = win.listeners["close"]?.[0];
    closeHandler({ preventDefault });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(win.hide).not.toHaveBeenCalled();
  });
});

describe("handleAppActivate", () => {
  it("restores, shows, and focuses an existing hidden and minimized window", async () => {
    const win = createMockWindow({
      isMinimized: vi.fn(() => true),
      isVisible: vi.fn(() => false),
    });
    const createNewWindow = vi.fn();

    await handleAppActivate(
      () => win,
      () => 1,
      createNewWindow,
    );

    expect(win.restore).toHaveBeenCalled();
    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
    expect(createNewWindow).not.toHaveBeenCalled();
  });

  it("calls createNewWindow fallback when window is null and count is 0", async () => {
    const createNewWindow = vi.fn();

    await handleAppActivate(
      () => null,
      () => 0,
      createNewWindow,
    );

    expect(createNewWindow).toHaveBeenCalled();
  });

  it("calls createNewWindow fallback when window is destroyed and count is 0", async () => {
    const win = createMockWindow({
      isDestroyed: vi.fn(() => true),
    });
    const createNewWindow = vi.fn();

    await handleAppActivate(
      () => win,
      () => 0,
      createNewWindow,
    );

    expect(win.show).not.toHaveBeenCalled();
    expect(createNewWindow).toHaveBeenCalled();
  });
});

describe("handleSecondInstance", () => {
  it("restores, shows, and focuses window when second instance is requested", () => {
    const win = createMockWindow({
      isMinimized: vi.fn(() => true),
      isVisible: vi.fn(() => false),
    });

    handleSecondInstance(() => win);

    expect(win.restore).toHaveBeenCalled();
    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
  });

  it("ignores destroyed window gracefully", () => {
    const win = createMockWindow({
      isDestroyed: vi.fn(() => true),
    });

    handleSecondInstance(() => win);

    expect(win.show).not.toHaveBeenCalled();
    expect(win.focus).not.toHaveBeenCalled();
  });
});

describe("handleWindowAllClosed", () => {
  it("does not stop server or quit app on macOS (darwin)", () => {
    const stopServer = vi.fn();
    const appQuit = vi.fn();

    handleWindowAllClosed(stopServer, appQuit, "darwin");

    expect(stopServer).not.toHaveBeenCalled();
    expect(appQuit).not.toHaveBeenCalled();
  });

  it("stops server and quits app on non-macOS (win32/linux)", () => {
    const stopServer = vi.fn();
    const appQuit = vi.fn();

    handleWindowAllClosed(stopServer, appQuit, "win32");

    expect(stopServer).toHaveBeenCalled();
    expect(appQuit).toHaveBeenCalled();
  });
});

describe("handleBeforeQuit", () => {
  it("sets quitting flag to true and stops server", () => {
    const setQuitting = vi.fn();
    const stopServer = vi.fn();

    handleBeforeQuit(setQuitting, stopServer);

    expect(setQuitting).toHaveBeenCalledWith(true);
    expect(stopServer).toHaveBeenCalled();
  });
});
