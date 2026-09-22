export interface ExitSyncResult {
  success: boolean;
  hasUnsynced?: boolean;
  reason?: string;
}

export interface ElectronBridge {
  platform: NodeJS.Platform;
  isElectron: boolean;
  onUpdateAvailable: (callback: (info: unknown) => void) => void;
  onUpdateDownloaded: (callback: (info: unknown) => void) => void;
  onPrepareQuit?: (
    callback: () => Promise<ExitSyncResult | void> | void,
  ) => void;
  readyToQuit?: (result?: ExitSyncResult) => void;
}

declare global {
  interface Window {
    electron?: ElectronBridge;
  }
}
