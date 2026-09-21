export interface CommandLineApplier {
  appendSwitch(switchName: string, value?: string): void;
}

export interface AppTranslationChecker {
  runningUnderARM64Translation?: boolean;
}

/**
 * Configure Chromium command-line switches based on platform.
 *
 * On macOS:
 * - Omits --enable-zero-copy and --ignore-gpu-blocklist to avoid Metal/Angle compositor stalls.
 * - Retains hardware rasterization (enable-gpu-rasterization).
 * - Avoids Windows-only switches like CalculateNativeWinOcclusion.
 */
export function applyChromiumSwitches(
  commandLine: CommandLineApplier,
  platform: NodeJS.Platform = process.platform,
): void {
  commandLine.appendSwitch("enable-gpu-rasterization");

  if (platform !== "darwin") {
    commandLine.appendSwitch("enable-zero-copy");
    commandLine.appendSwitch("ignore-gpu-blocklist");
  }

  if (platform === "win32") {
    commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
  }
}

/**
 * Inspect whether the application is running under Rosetta 2 x86 translation on Apple Silicon.
 * Writes an actionable diagnostic warning to app logs if emulation is detected.
 */
export function checkRosettaTranslation(
  appInstance?: AppTranslationChecker,
  logger: (msg: string, isError?: boolean) => void = console.warn,
): boolean {
  if (appInstance?.runningUnderARM64Translation) {
    logger(
      "[Electron][Performance Warning] Running under Rosetta 2 x86 translation on Apple Silicon. This introduces emulation overhead and increases memory usage. Please install the native arm64 build for optimal performance.",
      true,
    );
    return true;
  }
  return false;
}
