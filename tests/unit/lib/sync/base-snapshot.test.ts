import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  saveBaseSnapshot,
  getBaseSnapshot,
  getBaseSnapshotRecord,
  clearBaseSnapshot,
  BASE_SNAPSHOT_STORAGE_KEY,
} from "@/lib/sync/base-snapshot";
import type { BackupData } from "@/lib/backup/types";

// In-memory stand-in for IDB
const idbStore = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: vi.fn(async (key: string) => idbStore.get(key)),
  set: vi.fn(async (key: string, val: unknown) => {
    idbStore.set(key, val);
  }),
  del: vi.fn(async (key: string) => {
    idbStore.delete(key);
  }),
}));

const mockBackupData: BackupData = {
  metadata: {
    version: 1,
    appVersion: "1.0.0",
    exportedAt: "2026-09-24T00:00:00.000Z",
  },
  tasks: [
    {
      id: "task-1",
      user_id: "user-1",
      project_id: null,
      parent_id: null,
      content: "Important meeting",
      description: null,
      priority: 1,
      due_date: "2026-09-25",
      do_date: null,
      is_evening: false,
      is_completed: false,
      completed_at: null,
      day_order: 0,
      recurrence: null,
      recurring_series_id: null,
      google_event_id: null,
      google_etag: null,
      created_at: "2026-09-20T00:00:00.000Z",
      updated_at: "2026-09-20T00:00:00.000Z",
    },
  ],
  projects: [],
  habits: [],
  habit_entries: [],
  focus_logs: [],
  events: [],
};

describe("base-snapshot", () => {
  beforeEach(async () => {
    idbStore.clear();
    await clearBaseSnapshot();
  });

  it("saves and retrieves a base snapshot with commitSha", async () => {
    await saveBaseSnapshot(mockBackupData, "sha-12345");

    const record = await getBaseSnapshotRecord();
    expect(record).not.toBeNull();
    expect(record?.commitSha).toBe("sha-12345");
    expect(record?.data.tasks).toHaveLength(1);
    expect(record?.data.tasks[0].id).toBe("task-1");

    const data = await getBaseSnapshot();
    expect(data).not.toBeNull();
    expect(data?.tasks[0].content).toBe("Important meeting");
  });

  it("persists into idb-keyval under the dedicated storage key", async () => {
    await saveBaseSnapshot(mockBackupData, "sha-abc");
    expect(idbStore.has(BASE_SNAPSHOT_STORAGE_KEY)).toBe(true);
  });

  it("clears base snapshot completely", async () => {
    await saveBaseSnapshot(mockBackupData, "sha-123");
    expect(await getBaseSnapshot()).not.toBeNull();

    await clearBaseSnapshot();
    expect(await getBaseSnapshot()).toBeNull();
    expect(await getBaseSnapshotRecord()).toBeNull();
    expect(idbStore.has(BASE_SNAPSHOT_STORAGE_KEY)).toBe(false);
  });

  it("falls back gracefully when idb-keyval set throws", async () => {
    const idb = await import("idb-keyval");
    (
      idb.set as unknown as { mockRejectedValueOnce: (err: unknown) => void }
    ).mockRejectedValueOnce(new Error("QuotaExceededError"));

    // Should not throw, should fall back to localStorage/memory
    await saveBaseSnapshot(mockBackupData, "sha-fallback");

    const retrieved = await getBaseSnapshot();
    expect(retrieved).not.toBeNull();
    expect(retrieved?.tasks).toHaveLength(1);
  });
});
