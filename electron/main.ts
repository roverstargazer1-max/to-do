import { app, BrowserWindow, shell } from "electron";
import * as path from "node:path";
import * as net from "node:net";
import * as http from "node:http";
import * as fs from "node:fs";
import { fork, ChildProcess } from "node:child_process";
import { initAutoUpdater } from "./updater";
import { persistServerPort, resolveStableServerPort } from "./server-port";

// Hardware acceleration and performance optimization switches
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;

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

function waitForServer(url: string, timeoutMs = 25000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    let resolved = false;

    const check = () => {
      if (resolved) return;
      const req = http.get(url, (res) => {
        if (!resolved) {
          resolved = true;
          res.resume();
          resolve();
        }
      });

      req.setTimeout(1000, () => {
        req.destroy();
        retry();
      });

      req.on("error", () => {
        retry();
      });

      req.end();
    };

    const retry = () => {
      if (resolved) return;
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timeout waiting for Next.js server at ${url}`));
      } else {
        const delay = Date.now() - start < 1500 ? 50 : 150;
        setTimeout(check, delay);
      }
    };

    check();
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

function startStandaloneServer(port: number): Promise<void> {
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

    const env = {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      ELECTRON_RUN_AS_NODE: "1",
      KAGELIN_DB_PATH:
        process.env.KAGELIN_DB_PATH ||
        path.join(app.getPath("userData"), "data.db"),
      KAGELIN_ASSETS_PATH:
        process.env.KAGELIN_ASSETS_PATH ||
        path.join(app.getPath("userData"), "assets"),
      NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`,
    };

    serverProcess = fork(serverPath, [], {
      cwd: path.dirname(serverPath),
      env,
      execArgv: ["--max-old-space-size=192"],
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });

    serverProcess.stdout?.on("data", (data) => {
      logServer(data, false);
    });

    serverProcess.stderr?.on("data", (data) => {
      logServer(data, true);
    });

    serverProcess.on("error", (err) => {
      log(`[Next.js Server] Process error: ${String(err)}`, true);
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

  // Initialize auto-updater
  initAutoUpdater(mainWindow);

  mainWindow.on("closed", () => {
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
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      let targetUrl = "http://localhost:3000";

      if (isDev) {
        log(
          "[Electron] Running in dev mode, connecting to http://localhost:3000",
        );
      } else {
        const userDataPath = app.getPath("userData");
        const port = await resolveStableServerPort(userDataPath, getFreePort);
        await startStandaloneServer(port);
        persistServerPort(userDataPath, port);
        targetUrl = `http://127.0.0.1:${port}`;
      }

      await createWindow(targetUrl);
    } catch (err) {
      log(`[Electron] Failed to start application: ${String(err)}`, true);
      app.quit();
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0 && mainWindow) {
        mainWindow.show();
      }
    });
  });

  function stopServer() {
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

  app.on("before-quit", () => {
    stopServer();
  });

  app.on("window-all-closed", () => {
    stopServer();
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
