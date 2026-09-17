import { app, BrowserWindow, shell } from "electron";
import * as path from "node:path";
import * as net from "node:net";
import * as http from "node:http";
import * as fs from "node:fs";
import { fork, ChildProcess } from "node:child_process";
import { initAutoUpdater } from "./updater";
import { persistServerPort, resolveStableServerPort } from "./server-port";

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;

const isDev = !app.isPackaged && process.env.ELECTRON_DEV === "1";

function log(msg: string, isError = false) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  if (isError) {
    console.error(msg);
  } else {
    console.log(msg);
  }
  try {
    const logPath = path.join(app.getPath("userData"), "app.log");
    fs.appendFileSync(logPath, line, "utf8");
  } catch {}
}

function logServer(data: Buffer | string, isError = false) {
  const text = data.toString();
  if (isError) {
    console.error(`[Next.js Server Err] ${text.trim()}`);
  } else {
    console.log(`[Next.js Server] ${text.trim()}`);
  }
  try {
    const logPath = path.join(app.getPath("userData"), "server.log");
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${text}`, "utf8");
  } catch {}
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
    const check = () => {
      const req = http.get(url, () => {
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for Next.js server at ${url}`));
        } else {
          setTimeout(check, 250);
        }
      });
      req.end();
    };
    check();
  });
}

function resolveServerPath(): string {
  const candidates = [
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
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
      SUPABASE_SECRET_KEY:
        process.env.SUPABASE_SECRET_KEY ||
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
      NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`,
    };

    serverProcess = fork(serverPath, [], {
      cwd: path.dirname(serverPath),
      env,
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
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
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
