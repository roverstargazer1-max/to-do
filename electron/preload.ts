import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  isElectron: true,
  onUpdateAvailable: (callback: (info: unknown) => void) => {
    ipcRenderer.on("update-available", (_event, value) => callback(value));
  },
  onUpdateDownloaded: (callback: (info: unknown) => void) => {
    ipcRenderer.on("update-downloaded", (_event, value) => callback(value));
  },
});
