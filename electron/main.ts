import { app, BrowserWindow, shell } from "electron";
import * as path from "node:path";
import * as net from "node:net";
import * as http from "node:http";
import * as fs from "node:fs";
import { fork, ChildProcess } from "node:child_process";
import { initAutoUpdater } from "./updater";

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;

const isDev = !app.isPackaged && process.env.ELECTRON_DEV === "1";

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
    console.log(
      `[Electron] Starting Next.js standalone server from: ${serverPath} on port ${port}`,
    );

    if (!fs.existsSync(serverPath)) {
      return reject(
        new Error(`Standalone server file not found at: ${serverPath}`),
      );
    }

    const env = {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
    };

    serverProcess = fork(serverPath, [], {
      env,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });

    serverProcess.stdout?.on("data", (data) => {
      console.log(`[Next.js Server] ${data.toString().trim()}`);
    });

    serverProcess.stderr?.on("data", (data) => {
      console.error(`[Next.js Server Err] ${data.toString().trim()}`);
    });

    serverProcess.on("error", (err) => {
      console.error("[Next.js Server] Process error:", err);
    });

    serverProcess.on("exit", (code, signal) => {
      console.log(
        `[Next.js Server] Exited with code ${code}, signal ${signal}`,
      );
      serverProcess = null;
    });

    const targetUrl = `http://127.0.0.1:${port}`;
    waitForServer(targetUrl)
      .then(() => {
        console.log(`[Next.js Server] Server is ready at ${targetUrl}`);
        resolve();
      })
      .catch(reject);
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

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
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
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      let targetUrl = "http://localhost:3000";

      if (isDev) {
        console.log(
          "[Electron] Running in dev mode, connecting to http://localhost:3000",
        );
      } else {
        const port = await getFreePort();
        await startStandaloneServer(port);
        targetUrl = `http://127.0.0.1:${port}`;
      }

      await createWindow(targetUrl);
    } catch (err) {
      console.error("[Electron] Failed to start application:", err);
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
      console.log("[Electron] Terminating Next.js server child process...");
      try {
        serverProcess.kill();
      } catch (e) {
        process.stderr.write(
          `[Electron] Error terminating server process: ${String(e)}\n`,
        );
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
