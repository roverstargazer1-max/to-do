import { describe, expect, it, vi } from "vitest";
import {
  applyChromiumSwitches,
  checkRosettaTranslation,
  type CommandLineApplier,
} from "../../../electron/runtime-flags";

describe("Electron runtime switches and platform tuning", () => {
  it("applies macOS-tuned switches (enables GPU rasterization, omits zero-copy and blocklist ignore)", () => {
    const switches: Array<{ switchName: string; value?: string }> = [];
    const commandLine: CommandLineApplier = {
      appendSwitch: (switchName, value) => {
        switches.push({ switchName, value });
      },
    };

    applyChromiumSwitches(commandLine, "darwin");

    const switchNames = switches.map((s) => s.switchName);

    expect(switchNames).toContain("enable-gpu-rasterization");
    expect(switchNames).not.toContain("enable-zero-copy");
    expect(switchNames).not.toContain("ignore-gpu-blocklist");
    expect(switchNames).not.toContain("disable-features");
  });

  it("applies Windows-tuned switches including CalculateNativeWinOcclusion", () => {
    const switches: Array<{ switchName: string; value?: string }> = [];
    const commandLine: CommandLineApplier = {
      appendSwitch: (switchName, value) => {
        switches.push({ switchName, value });
      },
    };

    applyChromiumSwitches(commandLine, "win32");

    const switchNames = switches.map((s) => s.switchName);

    expect(switchNames).toContain("enable-gpu-rasterization");
    expect(switchNames).toContain("enable-zero-copy");
    expect(switchNames).toContain("ignore-gpu-blocklist");
    expect(switches).toContainEqual({
      switchName: "disable-features",
      value: "CalculateNativeWinOcclusion",
    });
  });

  it("applies Linux-tuned switches without Windows occlusion disable", () => {
    const switches: Array<{ switchName: string; value?: string }> = [];
    const commandLine: CommandLineApplier = {
      appendSwitch: (switchName, value) => {
        switches.push({ switchName, value });
      },
    };

    applyChromiumSwitches(commandLine, "linux");

    const switchNames = switches.map((s) => s.switchName);

    expect(switchNames).toContain("enable-gpu-rasterization");
    expect(switchNames).toContain("enable-zero-copy");
    expect(switchNames).toContain("ignore-gpu-blocklist");
    expect(switchNames).not.toContain("disable-features");
  });
});

describe("Rosetta 2 translation detection", () => {
  it("logs a prominent diagnostic warning when running under Rosetta 2", () => {
    const logger = vi.fn();
    const isRosetta = checkRosettaTranslation(
      { runningUnderARM64Translation: true },
      logger,
    );

    expect(isRosetta).toBe(true);
    expect(logger).toHaveBeenCalledTimes(1);
    expect(logger.mock.calls[0][0]).toContain("Rosetta 2");
    expect(logger.mock.calls[0][0]).toContain("arm64");
    expect(logger.mock.calls[0][1]).toBe(true);
  });

  it("does not log or warn when running natively", () => {
    const logger = vi.fn();
    const isRosetta = checkRosettaTranslation(
      { runningUnderARM64Translation: false },
      logger,
    );

    expect(isRosetta).toBe(false);
    expect(logger).not.toHaveBeenCalled();
  });
});
