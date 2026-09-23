import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import * as path from "node:path";
import * as net from "node:net";
import * as fs from "node:fs";
import { fork, ChildProcess } from "node:child_process";
import { initAutoUpdater } from "./updater";
import { persistServerPort, resolveStableServerPort } from "./server-port";
import { createMcpAccessStore } from "../src/lib/mcp/token";
import {
  applyChromiumSwitches,
  buildStandaloneServerSpawnConfig,
  checkRosettaTranslation,
  waitForServer,
} from "./runtime-flags";
import { MemoryGovernor } from "./memory-governor";
import {
  handleAppActivate,
  handleBeforeQuit,
  handleSecondInstance,
  handleWindowAllClosed,
  setupWindowCloseHandler,
} from "./window-lifecycle";

// Hardware acceleration and performance optimization switches tailored by platform
applyChromiumSwitches(app.commandLine);

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;
let isQuitting = false;
let currentTargetUrl = "http://localhost:3000";
const memoryGovernor = new MemoryGovernor({ logger: log });

const isDev = !app.isPackaged && process.env.ELECTRON_DEV === "1";

// Asynchronous non-blocking file logger with size caps
let appLogStream: fs.WriteStream | null = null;
let serverLogStream: fs.WriteStream | null = null;
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB per log file

function rotateLogIfNeeded(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.size > MAX_LOG_SIZE) {
        const backup = `${filePath}.old`;
        if (fs.existsSync(backup)) fs.unlinkSync(backup);
        fs.renameSync(filePath, backup);
      }
    }
  } catch {}
}

function getLogStream(type: "app" | "server"): fs.WriteStream | null {
  try {
    const userData = app.getPath("userData");
    const target = path.join(userData, `${type}.log`);
    if (type === "app") {
      if (!appLogStream) {
        rotateLogIfNeeded(target);
        appLogStream = fs.createWriteStream(target, {
          flags: "a",
          encoding: "utf8",
        });
      }
      return appLogStream;
    } else {
      if (!serverLogStream) {
        rotateLogIfNeeded(target);
        serverLogStream = fs.createWriteStream(target, {
          flags: "a",
          encoding: "utf8",
        });
      }
      return serverLogStream;
    }
  } catch {
    return null;
  }
}

function log(msg: string, isError = false) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  if (isError) {
    console.error(msg);
  } else {
    console.log(msg);
  }
  const stream = getLogStream("app");
  if (stream && !stream.destroyed) {
    stream.write(line);
  }
}

function logServer(data: Buffer | string, isError = false) {
  const text = data.toString();
  if (isError) {
    console.error(`[Next.js Server Err] ${text.trim()}`);
  } else {
    console.log(`[Next.js Server] ${text.trim()}`);
  }
  const stream = getLogStream("server");
  if (stream && !stream.destroyed) {
    stream.write(`[${new Date().toISOString()}] ${text}\n`);
  }
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as net.AddressInfo;
      const port = address.port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

function resolveServerPath(): string {
  const candidates = [
    // Unpacked extraResources location (cleanest packaging)
    path.join(process.resourcesPath, "standalone", "server.js"),
    path.join(process.resourcesPath, ".next", "standalone", "server.js"),
    // Legacy asar-unpacked locations
    path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      ".next",
      "standalone",
      "server.js",
    ),
    path.join(process.resourcesPath, "app", ".next", "standalone", "server.js"),
    path.join(__dirname, "..", ".next", "standalone", "server.js"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Fallback to relative path from dist-electron
  return path.join(__dirname, "..", ".next", "standalone", "server.js");
}

function startStandaloneServer(port: number, mcpToken: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const serverPath = resolveServerPath();
    log(
      `[Electron] Starting Next.js standalone server from: ${serverPath} on port ${port}`,
    );

    if (!fs.existsSync(serverPath)) {
      const err = new Error(
        `Standalone server file not found at: ${serverPath}`,
      );
      log(String(err), true);
      return reject(err);
    }

    const config = buildStandaloneServerSpawnConfig(
      serverPath,
      port,
      app.getPath("userData"),
      process.env,
      mcpToken,
    );

    serverProcess = fork(config.serverPath, [], config.options);
    memoryGovernor.setServerProcess(serverProcess);

    serverProcess.stdout?.on("data", (data) => {
      logServer(data, false);
    });

    serverProcess.stderr?.on("data", (data) => {
      logServer(data, true);
    });

    serverProcess.on("error", (err) => {
      log(`[Next.js Server] Process error: ${String(err)}`, true);
    });

    serverProcess.on("message", (msg: unknown) => {
      if (
        msg &&
        typeof msg === "object" &&
        (msg as { type?: string }).type === "compact-memory-complete"
      ) {
        log("[Memory] Standalone server memory compaction completed.");
      }
    });

    serverProcess.on("exit", (code, signal) => {
      log(`[Next.js Server] Exited with code ${code}, signal ${signal}`);
      serverProcess = null;
      reject(new Error(`Server exited with code ${code}`));
    });

    const targetUrl = `http://127.0.0.1:${port}`;
    waitForServer(targetUrl)
      .then(() => {
        log(`[Next.js Server] Server is ready at ${targetUrl}`);
        if (serverProcess && typeof serverProcess.send === "function") {
          log("[Next.js Server] Dispatching post-boot garbage collection...");
          serverProcess.send({ type: "gc" });
        }
        resolve();
      })
      .catch((err) => {
        log(`[Next.js Server] Failed waiting for server: ${String(err)}`, true);
        reject(err);
      });
  });
}

function getIconPath(): string {
  const candidates = [
    path.join(process.resourcesPath, "public", "icon.png"),
    path.join(__dirname, "..", "public", "icon.png"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return "";
}

async function createWindow(targetUrl: string) {
  currentTargetUrl = targetUrl;
  const iconPath = getIconPath();
  log(`[Electron] Creating main window with target URL: ${targetUrl}`);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: "Kagelin",
    icon: iconPath || undefined,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#FCFCFA",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: true,
    },
  });

  setupWindowCloseHandler(mainWindow, () => isQuitting);

  let windowShown = false;
  const showWindow = () => {
    if (!windowShown && mainWindow && !mainWindow.isDestroyed()) {
      windowShown = true;
      mainWindow.show();
      log("[Electron] Main window displayed.");
    }
  };

  // Show window when content is ready, or fallback on finish load / timeout
  mainWindow.once("ready-to-show", showWindow);
  mainWindow.webContents.once("did-finish-load", () => {
    log(`[Renderer] did-finish-load successfully for ${targetUrl}`);
    showWindow();
  });
  setTimeout(showWindow, 3500);

  // Monitor renderer errors
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      log(
        `[Renderer] Failed to load URL: ${validatedURL} (code: ${errorCode}, error: ${errorDescription})`,
        true,
      );
    },
  );

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    log(
      `[Renderer] Process exited unexpectedly: reason=${details.reason}, code=${details.exitCode}`,
      true,
    );
  });

  // Toggle DevTools with F12 or Ctrl+Shift+I
  mainWindow.webContents.on("before-input-event", (_event, input) => {
    if (input.type === "keyDown") {
      if (
        input.key === "F12" ||
        (input.control && input.shift && input.key.toLowerCase() === "i")
      ) {
        log("[Electron] Toggling DevTools via shortcut");
        mainWindow?.webContents.toggleDevTools();
      }
    }
  });

  // Open external links in user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url.startsWith("http:") ||
      url.startsWith("https:") ||
      url.startsWith("mailto:")
    ) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  await mainWindow.loadURL(targetUrl);

  // Initialize memory governance lifecycle (blur debounce, minimize/hide immediate compaction)
  memoryGovernor.attach(mainWindow, serverProcess);

  // Initialize auto-updater
  initAutoUpdater(mainWindow);

  mainWindow.on("closed", () => {
    memoryGovernor.detach();
    mainWindow = null;
  });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  log("[Electron] Another instance is already running. Quitting application.");
  app.quit();
} else {
  app.on("second-instance", () => {
    log("[Electron] Second instance requested; focusing main window.");
    handleSecondInstance(() => mainWindow);
  });

  app.whenReady().then(async () => {
    try {
      checkRosettaTranslation(app, log);

      const userDataPath = app.getPath("userData");
      const mcpAccessStore = createMcpAccessStore(userDataPath);

      if (isDev) {
        log(
          "[Electron] Running in dev mode, connecting to http://localhost:3000",
        );
      } else {
        const port = await resolveStableServerPort(userDataPath, getFreePort);
        // The embedded server process authorizes against this file
        // (`KAGELIN_MCP_DIR`); the token is never written to the logs.
        const mcpToken = mcpAccessStore.ensureToken();
        await startStandaloneServer(port, mcpToken);
        persistServerPort(userDataPath, port);
        currentTargetUrl = `http://127.0.0.1:${port}`;
      }

      await createWindow(currentTargetUrl);
    } catch (err) {
      log(`[Electron] Failed to start application: ${String(err)}`, true);
      app.quit();
    }

    app.on("activate", async () => {
      await handleAppActivate(
        () => mainWindow,
        () => BrowserWindow.getAllWindows().length,
        async () => {
          log(
            "[Electron] Reactivating with no windows open; creating new window.",
          );
          await createWindow(currentTargetUrl);
        },
      );
    });
  });

  function stopServer() {
    memoryGovernor.setServerProcess(null);
    if (serverProcess && !serverProcess.killed) {
      log("[Electron] Terminating Next.js server child process...");
      try {
        serverProcess.kill();
      } catch (e) {
        log(`[Electron] Error terminating server process: ${String(e)}`, true);
        throw e;
      } finally {
        serverProcess = null;
      }
    }
  }

  // Immediate compaction on macOS application hide (Cmd+H)
  (app as unknown as NodeJS.EventEmitter).on("hide", () => {
    memoryGovernor.triggerCompaction("app-hide").catch((err: unknown) => {
      log(`[Memory] Compaction error on hide: ${String(err)}`, true);
    });
  });

  let isQuittingPrepared = false;
  let exitSyncTimeout: NodeJS.Timeout | null = null;

  const performFinalQuit = () => {
    if (exitSyncTimeout) {
      clearTimeout(exitSyncTimeout);
      exitSyncTimeout = null;
    }
    isQuittingPrepared = true;
    handleBeforeQuit(
      (val) => {
        isQuitting = val;
      },
      () => stopServer(),
    );
    app.quit();
  };

  const promptSyncFailureAndQuit = async (reason = "网络离线或同步失败") => {
    if (exitSyncTimeout) {
      clearTimeout(exitSyncTimeout);
      exitSyncTimeout = null;
    }

    if (!mainWindow || mainWindow.isDestroyed()) {
      performFinalQuit();
      return;
    }

    try {
      if (
        typeof mainWindow.isVisible === "function" &&
        !mainWindow.isVisible()
      ) {
        mainWindow.show();
      }
      mainWindow.focus();
    } catch {}

    const choice = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      buttons: ["仍然退出 (Exit Anyway)", "取消退出 (Cancel)"],
      defaultId: 0,
      cancelId: 1,
      title: "云端同步未完成",
      message: "检测到当前处于未联网状态（或推送至 GitHub 失败）",
      detail: `原因：${reason}\n\n本地 SQLite 数据库及备份中已安全保留您的所有修改。您可以选择现在退出（下次联网启动时会自动同步），也可以取消退出留在应用中检查。`,
    });

    if (choice.response === 0) {
      log("[Electron] User chose to exit despite unsynced changes.");
      performFinalQuit();
    } else {
      log("[Electron] User canceled quit to remain in application.");
      isQuitting = false;
      isQuittingPrepared = false;
      if (!mainWindow.isDestroyed()) {
        mainWindow.focus();
      }
    }
  };

  ipcMain.on(
    "exit-sync-complete",
    async (
      _event,
      result?: { success: boolean; hasUnsynced?: boolean; reason?: string },
    ) => {
      log(
        `[Electron] Exit sync signal received from renderer: success=${result?.success}, hasUnsynced=${result?.hasUnsynced}`,
      );
      if (result?.hasUnsynced && !result?.success) {
        await promptSyncFailureAndQuit(
          result.reason || "网络连接中断或 GitHub 响应异常",
        );
      } else {
        performFinalQuit();
      }
    },
  );

  app.on("before-quit", (event) => {
    if (isQuittingPrepared) {
      return;
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      event.preventDefault();
      log(
        "[Electron] Intercepted before-quit; notifying renderer for graceful exit sync.",
      );

      // 5-second safety fallback to avoid blocking quit indefinitely on network stalls
      exitSyncTimeout = setTimeout(async () => {
        log(
          "[Electron] Exit sync timeout reached (5s); prompting user or forcing shutdown.",
          true,
        );
        await promptSyncFailureAndQuit("网络请求超时（超过 5 秒未响应）");
      }, 5000);

      mainWindow.webContents.send("request-exit-sync");
    } else {
      performFinalQuit();
    }
  });

  app.on("window-all-closed", () => {
    handleWindowAllClosed(
      () => stopServer(),
      () => app.quit(),
    );
  });
}
