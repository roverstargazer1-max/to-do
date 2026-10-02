import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "kanso_guest_data_v11";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/api/local-dal", () => ({ getLocalDal: () => null }));

describe("legacy store initialization", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("does not manufacture legacy data when a local installation starts", async () => {
    const { mockStore } = await import("@/lib/mock/mock-store");

    expect(mockStore.getTasks()).toEqual([]);
    expect(mockStore.getHabits()).toEqual([]);
    expect(mockStore.isInDemoMode()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("keeps existing legacy records available for migration without rewriting them", async () => {
    const legacyData = {
      tasks: [{ id: "legacy-task", content: "My existing task" }],
      projects: [],
      habits: [],
      habit_entries: [],
      focus_logs: [],
      events: [],
      lastUpdated: "2026-01-01T00:00:00.000Z",
    };
    const serialized = JSON.stringify(legacyData);
    localStorage.setItem(STORAGE_KEY, serialized);

    const { mockStore } = await import("@/lib/mock/mock-store");

    expect(mockStore.getTasks()).toEqual(legacyData.tasks);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(serialized);
  });
});
