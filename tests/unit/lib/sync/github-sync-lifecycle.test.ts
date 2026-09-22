import { describe, it, expect, beforeEach } from "vitest";
import { shouldPullRemoteCommit } from "@/lib/sync/github-sync";
import { useGitHubSyncStore } from "@/lib/store/githubSyncStore";

describe("GitHub Sync Lifecycle Logic", () => {
  beforeEach(() => {
    useGitHubSyncStore.getState().clearConfig();
  });

  describe("shouldPullRemoteCommit (Commit SHA diffing & clock skew resilience)", () => {
    const localDeviceId = "local-device-001";
    const remoteDeviceId = "remote-device-002";

    it("does not pull if remote metadata is null", () => {
      const result = shouldPullRemoteCommit({
        remoteMeta: null,
        localDeviceId,
        lastRemoteCommitSha: "abc1234",
        lastSyncTime: "2026-09-22T08:00:00.000Z",
      });
      expect(result.shouldPull).toBe(false);
    });

    it("does not pull if remote commit was pushed by the same device (prevents self echo)", () => {
      const result = shouldPullRemoteCommit({
        remoteMeta: {
          version: 1,
          deviceId: localDeviceId,
          deviceLabel: "Local MacBook",
          updatedAt: "2026-09-22T09:00:00.000Z",
          commitSha: "def5678",
          appVersion: "1.4.1",
        },
        localDeviceId,
        lastRemoteCommitSha: "abc1234",
        lastSyncTime: "2026-09-22T08:00:00.000Z",
      });
      expect(result.shouldPull).toBe(false);
    });

    it("pulls when remote has a different commit SHA from another device", () => {
      const result = shouldPullRemoteCommit({
        remoteMeta: {
          version: 1,
          deviceId: remoteDeviceId,
          deviceLabel: "Office Desktop",
          updatedAt: "2026-09-22T08:30:00.000Z",
          commitSha: "commit-999",
          appVersion: "1.4.1",
        },
        localDeviceId,
        lastRemoteCommitSha: "commit-111",
        lastSyncTime: "2026-09-22T08:00:00.000Z",
      });
      expect(result.shouldPull).toBe(true);
      expect(result.reason).toBe("new-commit");
    });

    it("tolerates clock skew: pulls when commit SHA is new even if remote timestamp is behind local sync time", () => {
      // Remote device's system clock is 10 minutes slow
      const result = shouldPullRemoteCommit({
        remoteMeta: {
          version: 1,
          deviceId: remoteDeviceId,
          deviceLabel: "Slow Clock Laptop",
          updatedAt: "2026-09-22T07:50:00.000Z", // Older timestamp!
          commitSha: "new-commit-with-skew",
          appVersion: "1.4.1",
        },
        localDeviceId,
        lastRemoteCommitSha: "old-commit-sha",
        lastSyncTime: "2026-09-22T08:00:00.000Z", // Newer local timestamp
      });

      // Should still pull because commit SHA is brand new!
      expect(result.shouldPull).toBe(true);
      expect(result.reason).toBe("new-commit");
    });

    it("does not pull if commit SHA has already been synced", () => {
      const result = shouldPullRemoteCommit({
        remoteMeta: {
          version: 1,
          deviceId: remoteDeviceId,
          deviceLabel: "Office Desktop",
          updatedAt: "2026-09-22T09:00:00.000Z",
          commitSha: "already-synced-sha",
          appVersion: "1.4.1",
        },
        localDeviceId,
        lastRemoteCommitSha: "already-synced-sha",
        lastSyncTime: "2026-09-22T08:00:00.000Z",
      });
      expect(result.shouldPull).toBe(false);
    });

    it("falls back to timestamp comparison when commitSha is not available", () => {
      const result = shouldPullRemoteCommit({
        remoteMeta: {
          version: 1,
          deviceId: remoteDeviceId,
          deviceLabel: "Legacy Device",
          updatedAt: "2026-09-22T08:30:00.000Z",
          appVersion: "1.0.0",
        },
        localDeviceId,
        lastRemoteCommitSha: null,
        lastSyncTime: "2026-09-22T08:00:00.000Z",
      });
      expect(result.shouldPull).toBe(true);
      expect(result.reason).toBe("timestamp-newer");
    });
  });

  describe("useGitHubSyncStore hasUnsyncedChanges tracking", () => {
    it("initializes hasUnsyncedChanges as false", () => {
      const state = useGitHubSyncStore.getState();
      expect(state.hasUnsyncedChanges).toBe(false);
    });

    it("updates hasUnsyncedChanges via setHasUnsyncedChanges", () => {
      useGitHubSyncStore.getState().setHasUnsyncedChanges(true);
      expect(useGitHubSyncStore.getState().hasUnsyncedChanges).toBe(true);

      useGitHubSyncStore.getState().setHasUnsyncedChanges(false);
      expect(useGitHubSyncStore.getState().hasUnsyncedChanges).toBe(false);
    });

    it("resets hasUnsyncedChanges to false upon recordSyncSuccess", () => {
      useGitHubSyncStore.getState().setHasUnsyncedChanges(true);
      expect(useGitHubSyncStore.getState().hasUnsyncedChanges).toBe(true);

      useGitHubSyncStore.getState().recordSyncSuccess({
        version: 1,
        deviceId: "dev-1",
        deviceLabel: "MacBook",
        updatedAt: "2026-09-22T10:00:00.000Z",
        commitSha: "commit-abc",
        dataSha: "blob-xyz",
        appVersion: "1.4.1",
      });

      const updatedState = useGitHubSyncStore.getState();
      expect(updatedState.hasUnsyncedChanges).toBe(false);
      expect(updatedState.lastRemoteCommitSha).toBe("commit-abc");
      expect(updatedState.lastRemoteDataSha).toBe("blob-xyz");
      expect(updatedState.status).toBe("success");
    });
  });
});
