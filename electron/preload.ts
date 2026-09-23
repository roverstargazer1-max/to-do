import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  isElectron: true,
  mcp: {
    getStatus: () => ipcRenderer.invoke("mcp:status"),
    setEnabled: (enabled: boolean) =>
      ipcRenderer.invoke("mcp:set-enabled", enabled),
    resetToken: () => ipcRenderer.invoke("mcp:reset-token"),
  },
  onUpdateAvailable: (callback: (info: unknown) => void) => {
    ipcRenderer.on("update-available", (_event, value) => callback(value));
  },
  onUpdateDownloaded: (callback: (info: unknown) => void) => {
    ipcRenderer.on("update-downloaded", (_event, value) => callback(value));
  },
  onPrepareQuit: (
    callback: () => Promise<{
      success: boolean;
      hasUnsynced?: boolean;
      reason?: string;
    } | void> | void,
  ) => {
    ipcRenderer.on("request-exit-sync", async () => {
      try {
        const res = await callback();
        ipcRenderer.send("exit-sync-complete", res || { success: true });
      } catch (err) {
        ipcRenderer.send("exit-sync-complete", {
          success: false,
          hasUnsynced: true,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    });
  },
  readyToQuit: (result?: {
    success: boolean;
    hasUnsynced?: boolean;
    reason?: string;
  }) => {
    ipcRenderer.send("exit-sync-complete", result || { success: true });
  },
});
