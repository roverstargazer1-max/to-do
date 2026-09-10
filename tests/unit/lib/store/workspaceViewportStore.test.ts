import { describe, it, expect, vi, beforeEach } from "vitest";

const persistedWrites: string[] = [];
const localStorageBacking = new Map<string, string>();

vi.stubGlobal("localStorage", {
  getItem: (key: string) => localStorageBacking.get(key) ?? null,
  setItem: (key: string, value: string) => {
    localStorageBacking.set(key, value);
    persistedWrites.push(key);
  },
  removeItem: (key: string) => localStorageBacking.delete(key),
  clear: () => localStorageBacking.clear(),
});

// Imported dynamically so the stubbed localStorage is in place before the
// persist middleware captures its storage reference at module init.
const { useWorkspaceViewportStore, DEFAULT_VIEWPORT } =
  await import("@/lib/store/workspaceViewportStore");

const { setState, getState } = useWorkspaceViewportStore;

describe("WorkspaceViewportStore", () => {
  beforeEach(() => {
    localStorageBacking.clear();
    persistedWrites.length = 0;
    // Reset to the persisted-partialize shape without touching functions.
    setState({ viewports: {} });
  });

  it("saves and reads a viewport per workspace without cross-talk", () => {
    getState().setViewport("ws-a", { x: 100, y: 50, zoom: 1.25 });
    getState().setViewport("ws-b", { x: -40, y: 12, zoom: 0.75 });

    expect(getState().getViewport("ws-a")).toEqual({
      x: 100,
      y: 50,
      zoom: 1.25,
    });
    expect(getState().getViewport("ws-b")).toEqual({
      x: -40,
      y: 12,
      zoom: 0.75,
    });
  });

  it("returns undefined for an unseen workspace (React Flow's origin default applies)", () => {
    expect(getState().getViewport("ws-unknown")).toBeUndefined();
  });

  it("forgets only the targeted workspace — switching canvases swaps the saved state", () => {
    getState().setViewport("ws-a", { x: 10, y: 10, zoom: 1 });
    getState().setViewport("ws-b", { x: 20, y: 20, zoom: 2 });

    getState().forgetWorkspace("ws-a");

    expect(getState().getViewport("ws-a")).toBeUndefined();
    expect(getState().getViewport("ws-b")).toEqual({ x: 20, y: 20, zoom: 2 });
  });

  it("persists device-locally under its own key and survives a reload", () => {
    getState().setViewport("ws-a", { x: 5, y: 6, zoom: 0.9 });

    // The persist middleware writes synchronously to the stubbed storage.
    expect(persistedWrites).toContain("kanso-workspace-viewport");

    // A fresh page load re-hydrates from the same key.
    const persisted = JSON.parse(
      localStorageBacking.get("kanso-workspace-viewport") ?? "{}",
    );
    expect(persisted.state.viewports["ws-a"]).toEqual({
      x: 5,
      y: 6,
      zoom: 0.9,
    });
    expect(persisted.version).toBe(1);
  });

  it("default viewport is the origin", () => {
    expect(DEFAULT_VIEWPORT).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});
