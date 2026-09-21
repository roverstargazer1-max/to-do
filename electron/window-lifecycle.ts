export interface WindowCloseEvent {
  preventDefault(): void;
  defaultPrevented?: boolean;
}

export interface WindowLifecycleWindow {
  isDestroyed(): boolean;
  isMinimized?(): boolean;
  isVisible?(): boolean;
  isFullScreen?(): boolean;
  setFullScreen?(flag: boolean): void;
  show(): void;
  hide(): void;
  restore(): void;
  focus(): void;
  on(event: "close", listener: (event: WindowCloseEvent) => void): void;
  once?(event: "leave-full-screen", listener: () => void): void;
}

/**
 * Attaches the close handler to the main window.
 * On macOS (darwin), when not quitting, prevents window destruction and hides the window.
 * If in full-screen mode, exits full-screen first before hiding to prevent transition glitches.
 */
export function setupWindowCloseHandler(
  window: WindowLifecycleWindow,
  isQuittingGetter: () => boolean,
  platform: NodeJS.Platform = process.platform,
): void {
  window.on("close", (event: WindowCloseEvent) => {
    if (platform === "darwin" && !isQuittingGetter()) {
      if (typeof event?.preventDefault === "function") {
        event.preventDefault();
      }

      if (typeof window.isFullScreen === "function" && window.isFullScreen()) {
        if (typeof window.once === "function") {
          window.once("leave-full-screen", () => {
            if (!window.isDestroyed()) {
              window.hide();
            }
          });
        }
        if (typeof window.setFullScreen === "function") {
          window.setFullScreen(false);
        }
      } else {
        window.hide();
      }
    }
  });
}

/**
 * Handles macOS Dock icon click or reactivation.
 * If the window is hidden or minimized, unhides and focuses it.
 * If all windows were closed/destroyed, invokes createNewWindow fallback.
 */
export async function handleAppActivate(
  getMainWindow: () => WindowLifecycleWindow | null | undefined,
  getAllWindowsCount: () => number,
  createNewWindow: () => Promise<void> | void,
): Promise<void> {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    if (typeof win.isMinimized === "function" && win.isMinimized()) {
      win.restore();
    }
    if (typeof win.isVisible === "function" && !win.isVisible()) {
      win.show();
    } else if (typeof win.isVisible !== "function") {
      win.show();
    }
    win.focus();
  } else if (getAllWindowsCount() === 0) {
    await createNewWindow();
  }
}

/**
 * Handles second-instance request to focus existing window.
 */
export function handleSecondInstance(
  getMainWindow: () => WindowLifecycleWindow | null | undefined,
): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    if (typeof win.isMinimized === "function" && win.isMinimized()) {
      win.restore();
    }
    if (typeof win.isVisible === "function" && !win.isVisible()) {
      win.show();
    } else if (typeof win.isVisible !== "function") {
      win.show();
    }
    win.focus();
  }
}

/**
 * Handles window-all-closed event.
 * On macOS, the app stays running and the server remains alive.
 * On Windows/Linux, stops the server and quits the app.
 */
export function handleWindowAllClosed(
  stopServer: () => void,
  appQuit: () => void,
  platform: NodeJS.Platform = process.platform,
): void {
  if (platform !== "darwin") {
    stopServer();
    appQuit();
  }
}

/**
 * Handles before-quit event.
 * Marks quitting state so window close listeners permit destruction, and stops background server.
 */
export function handleBeforeQuit(
  setQuitting: (quitting: boolean) => void,
  stopServer: () => void,
): void {
  setQuitting(true);
  stopServer();
}
