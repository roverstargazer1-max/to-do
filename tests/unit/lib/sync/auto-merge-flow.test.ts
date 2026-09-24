import { describe, it, expect, vi, beforeEach } from "vitest";
import { decideSyncFlow } from "@/lib/sync/github-sync";
import { mergeBackupData } from "@/lib/sync/merge-engine";
import { useGitHubSyncStore } from "@/lib/store/githubSyncStore";
import type { BackupData } from "@/lib/backup/types";
import type { Task } from "@/lib/types/task";

function createEmptyData(): BackupData {
  return {
    metadata: {
      version: 1,
      appVersion: "1.0.0",
      exportedAt: "2026-09-24T00:00:00.000Z",
    },
    tasks: [],
    projects: [],
    habits: [],
    habit_entries: [],
    focus_logs: [],
    events: [],
  };
}

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    user_id: "u1",
    project_id: null,
    parent_id: null,
    content: "Base Task",
    description: null,
    priority: 3,
    due_date: null,
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
    ...overrides,
  };
}

describe("Issue 04: Auto-merge Orchestration & 409 Retry Protection", () => {
  beforeEach(() => {
    useGitHubSyncStore.getState().clearConfig();
  });

  describe("decideSyncFlow in two-way change scenario", () => {
    it("returns conflict with remote device label when shouldPull && hasUnsyncedChanges", () => {
      const action = decideSyncFlow({
        shouldPull: true,
        pullDevice: "Windows PC",
        hasUnsyncedChanges: true,
        safety: { safe: true },
      });

      expect(action).toEqual({
        kind: "conflict",
        device: "Windows PC",
      });
    });
  });

  describe("Auto-merge Fast-Forward Trial", () => {
    it("identifies clean merge when changes on both devices are non-conflicting", () => {
      const baseTask1 = createTask({ id: "t1", content: "Task 1" });
      const baseTask2 = createTask({ id: "t2", content: "Task 2" });

      const base = {
        ...createEmptyData(),
        tasks: [baseTask1, baseTask2],
      };

      // Local modified Task 1
      const local = {
        ...createEmptyData(),
        tasks: [
          createTask({
            id: "t1",
            content: "Task 1 edited on Mac",
            updated_at: "2026-09-24T01:00:00.000Z",
          }),
          baseTask2,
        ],
      };

      // Remote added Task 3
      const remote = {
        ...createEmptyData(),
        tasks: [
          baseTask1,
          baseTask2,
          createTask({
            id: "t3",
            content: "Task 3 added on Windows",
            updated_at: "2026-09-24T02:00:00.000Z",
          }),
        ],
      };

      const mergeResult = mergeBackupData({ base, local, remote });
      expect(mergeResult.clean).toBe(true);
      expect(mergeResult.conflicts).toHaveLength(0);
      expect(mergeResult.mergedData.tasks).toHaveLength(3);
      expect(
        mergeResult.mergedData.tasks.find((t) => t.id === "t1")?.content,
      ).toBe("Task 1 edited on Mac");
      expect(
        mergeResult.mergedData.tasks.find((t) => t.id === "t3")?.content,
      ).toBe("Task 3 added on Windows");
    });

    it("identifies real conflict when both devices modified the same task content differently", () => {
      const baseTask = createTask({ id: "t1", content: "Original Task" });
      const base = { ...createEmptyData(), tasks: [baseTask] };

      const local = {
        ...createEmptyData(),
        tasks: [
          createTask({
            id: "t1",
            content: "Mac version of Task",
            updated_at: "2026-09-24T01:00:00.000Z",
          }),
        ],
      };

      const remote = {
        ...createEmptyData(),
        tasks: [
          createTask({
            id: "t1",
            content: "Windows version of Task",
            updated_at: "2026-09-24T02:00:00.000Z",
          }),
        ],
      };

      const mergeResult = mergeBackupData({ base, local, remote });
      expect(mergeResult.clean).toBe(false);
      expect(mergeResult.conflicts).toHaveLength(1);
      expect(mergeResult.conflicts[0].id).toBe("t1");
      expect(mergeResult.conflicts[0].conflictType).toBe("modify-modify");

      // Verify pending conflict store integration
      useGitHubSyncStore.getState().setPendingConflict({
        deviceLabel: "Windows PC",
        mergeResult,
        localData: local,
        remoteData: remote,
        remoteMeta: null,
      });

      const store = useGitHubSyncStore.getState();
      expect(store.pendingConflict).not.toBeNull();
      expect(store.pendingConflict?.deviceLabel).toBe("Windows PC");
      expect(store.pendingConflict?.mergeResult.conflicts).toHaveLength(1);
    });
  });

  describe("Store Pending Conflict Lifecycle", () => {
    it("clears pending conflict when clearPendingConflict or recordSyncSuccess is invoked", () => {
      const mergeResult = mergeBackupData({
        base: null,
        local: createEmptyData(),
        remote: createEmptyData(),
      });

      const store = useGitHubSyncStore.getState();
      store.setPendingConflict({
        deviceLabel: "Test Device",
        mergeResult,
        localData: createEmptyData(),
        remoteData: createEmptyData(),
        remoteMeta: null,
      });

      expect(useGitHubSyncStore.getState().pendingConflict).not.toBeNull();

      useGitHubSyncStore.getState().clearPendingConflict();
      expect(useGitHubSyncStore.getState().pendingConflict).toBeNull();

      // Setting again and testing recordSyncSuccess
      store.setPendingConflict({
        deviceLabel: "Test Device",
        mergeResult,
        localData: createEmptyData(),
        remoteData: createEmptyData(),
        remoteMeta: null,
      });
      useGitHubSyncStore.getState().recordSyncSuccess();
      expect(useGitHubSyncStore.getState().pendingConflict).toBeNull();
    });
  });
});
