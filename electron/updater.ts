import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";

export function initAutoUpdater(mainWindow?: BrowserWindow | null) {
  // Only check for updates in packaged production builds
  if (!app.isPackaged) {
    console.log("[AutoUpdater] Skipping update check in development mode.");
    return;
  }

  autoUpdater.logger = console;
  // Allow prereleases (e.g. preview versions)
  autoUpdater.allowPrerelease = true;
  // Automatically download available updates in background
  autoUpdater.autoDownload = true;
  // Automatically install when the user quits the app
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    console.log("[AutoUpdater] Checking for update...");
  });

  autoUpdater.on("update-available", (info) => {
    console.log(`[AutoUpdater] Update available: version ${info.version}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-available", info);
    }
  });

  autoUpdater.on("update-not-available", (_info) => {
    console.log(
      "[AutoUpdater] Update not available. Current version is up to date.",
    );
  });

  autoUpdater.on("error", (err) => {
    console.warn(
      "[AutoUpdater] Error in auto-updater (ignored):",
      err == null ? "unknown" : (err.stack || err).toString(),
    );
  });

  autoUpdater.on("download-progress", (progressObj) => {
    const msg = `[AutoUpdater] Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent.toFixed(1)}%`;
    console.log(msg);
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log(
      `[AutoUpdater] Update downloaded: version ${info.version}. Will install on exit.`,
    );
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-downloaded", info);
    }
  });

  // Check for updates upon launch
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.warn("[AutoUpdater] Failed to check for updates (ignored):", err);
  });
}
