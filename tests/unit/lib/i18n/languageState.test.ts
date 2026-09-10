import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { useUiStore } from "@/lib/store/uiStore";

type UiStore = typeof useUiStore;

/**
 * Re-imports the uiStore module so store creation (and thus language
 * detection) runs against the currently stubbed navigator and seeded
 * localStorage — mirroring a fresh browser load.
 */
async function importFreshStore(): Promise<UiStore> {
  const mod = await import("@/lib/store/uiStore");
  return mod.useUiStore;
}

describe("uiStore language field", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to zh-CN when the browser is Chinese", async () => {
    vi.stubGlobal("navigator", { language: "zh-CN" });
    const store = await importFreshStore();
    expect(store.getState().language).toBe("zh-CN");
  });

  it("defaults to en when the browser is not Chinese", async () => {
    vi.stubGlobal("navigator", { language: "fr-FR" });
    const store = await importFreshStore();
    expect(store.getState().language).toBe("en");
  });

  it("is SSR-safe: en when navigator is missing", async () => {
    vi.stubGlobal("navigator", undefined);
    const store = await importFreshStore();
    expect(store.getState().language).toBe("en");
  });

  it("a stored zh-CN wins over a detected en default (rehydrate override)", async () => {
    vi.stubGlobal("navigator", { language: "en-US" });
    localStorage.setItem(
      "kanso-ui-state",
      JSON.stringify({ state: { language: "zh-CN" }, version: 1 }),
    );
    const store = await importFreshStore();
    expect(store.getState().language).toBe("zh-CN");
  });

  it("a stored en choice wins over a zh browser detection", async () => {
    vi.stubGlobal("navigator", { language: "zh-CN" });
    localStorage.setItem(
      "kanso-ui-state",
      JSON.stringify({ state: { language: "en" }, version: 1 }),
    );
    const store = await importFreshStore();
    expect(store.getState().language).toBe("en");
  });

  it("setLanguage updates the field and persists it to kanso-ui-state", async () => {
    const store = await importFreshStore();
    expect(store.getState().language).toBe("en");

    store.getState().setLanguage?.("zh-CN");
    expect(store.getState().language).toBe("zh-CN");

    const persisted = JSON.parse(
      localStorage.getItem("kanso-ui-state") ?? "{}",
    );
    expect(persisted.state.language).toBe("zh-CN");
  });

  it("an existing kanso-ui-state row without language backfills the detected default", async () => {
    // Pre-i18n persisted rows lack the field; zustand's merge keeps the
    // store default (spec D-11 — no version bump needed).
    vi.stubGlobal("navigator", { language: "zh-CN" });
    localStorage.setItem(
      "kanso-ui-state",
      JSON.stringify({ state: { timeFormat: "24h" }, version: 1 }),
    );
    const store = await importFreshStore();
    expect(store.getState().language).toBe("zh-CN");
    expect(store.getState().timeFormat).toBe("24h");
  });
});
