export interface ExitSyncResult {
  success: boolean;
  hasUnsynced?: boolean;
  reason?: string;
}

/**
 * Mirror of `electron/mcp-bridge.ts` `McpChannelStatus`. The renderer only ever
 * sees this shape, so the token stays a main-process concern everywhere else.
 */
export interface McpChannelStatus {
  available: boolean;
  running: boolean;
  enabled: boolean;
  token: string | null;
  url: string;
}

export interface ElectronMcpBridge {
  getStatus: () => Promise<McpChannelStatus>;
  setEnabled: (enabled: boolean) => Promise<McpChannelStatus>;
  resetToken: () => Promise<McpChannelStatus>;
}

export interface ElectronBridge {
  platform: NodeJS.Platform;
  isElectron: boolean;
  mcp?: ElectronMcpBridge;
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
