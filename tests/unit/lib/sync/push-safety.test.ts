import { describe, it, expect, vi, type Mock } from "vitest";
import type { BackupData } from "@/lib/backup/types";
import {
  countBackupEntries,
  assessPushSafety,
  decideSyncFlow,
  resolveRemoteSyncMeta,
  checkPushSafety,
  shouldPullRemoteCommit,
  fingerprintBackupData,
  DATA_FILE_PATH,
  META_FILE_PATH,
} from "@/lib/sync/github-sync";
import { emptyBackup, backupWith } from "../../support/backupDataFixtures";

interface FetchScenario {
  /** sync-meta.json raw endpoint. Omit/status 404 => meta missing. */
  meta?: { status: number; body?: unknown };
  /** kagelin-data.json endpoint. Body is served as JSON text for the raw
   *  fetch and its blob SHA is served from the contents endpoint. */
  data?: { status: number; body?: BackupData };
  blobSha?: string;
}

/** Shared GitHub API fetch stub used across the remote-meta/DLP cases. */
function stubGitHubFetch(scenario: FetchScenario = {}): Mock {
  const fetchMock = vi.fn(
    async (urlInput: RequestInfo | URL, init?: RequestInit) => {
      const url = String(urlInput);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const isRaw = headers["Accept"] === "application/vnd.github.raw+json";

      if (url.includes(META_FILE_PATH)) {
        const meta = scenario.meta;
        if (!meta || meta.status !== 200) {
          return { ok: false, status: meta?.status ?? 404 };
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(meta.body),
        };
      }

      if (url.includes(DATA_FILE_PATH)) {
        const data = scenario.data;
        if (isRaw) {
          if (!data || data.status !== 200) {
            return { ok: false, status: data?.status ?? 404 };
          }
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify(data.body),
          };
        }
        // Contents (blob SHA) endpoint
        if (!data || data.status !== 200) {
          return { ok: false, status: 404 };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ sha: scenario.blobSha ?? "blob-sha" }),
        };
      }

      return { ok: false, status: 500 };
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("push-safety", () => {
  const mockConfig = {
    token: "ghp_testtoken12345",
    repo: "testuser/my-repo",
    branch: "main",
    deviceLabel: "MacBook Test",
    deviceId: "device-123",
  };

  describe("countBackupEntries", () => {
    it("counts 0 for an empty snapshot", () => {
      expect(countBackupEntries(emptyBackup)).toBe(0);
    });

    it("aggregates across sections including optional workspaces", () => {
      expect(
        countBackupEntries(backupWith({ tasks: 3, habits: 2, workspaces: 4 })),
      ).toBe(9);
    });
  });

  describe("assessPushSafety (DLP guard)", () => {
    it("allows a first push when the remote has nothing", () => {
      const res = assessPushSafety(backupWith({ tasks: 5 }), null);
      expect(res.safe).toBe(true);
      expect(res.remoteMissing).toBe(true);
    });

    it("hard-blocks pushing an empty local snapshot over a populated remote", () => {
      const res = assessPushSafety(emptyBackup, backupWith({ tasks: 3 }));
      expect(res.safe).toBe(false);
      expect(res.reason).toBe("local-empty");
      expect(res.counts).toEqual({ local: 0, remote: 3 });
    });

    it("blocks a cliff drop: local drops below remote × (1 - threshold)", () => {
      const res = assessPushSafety(
        backupWith({ tasks: 5 }),
        backupWith({ tasks: 15 }),
      );
      expect(res.safe).toBe(false);
      expect(res.reason).toBe("cliff-drop");
      expect(res.counts).toEqual({ local: 5, remote: 15 });
    });

    it("allows a push when counts are close (within the cliff threshold)", () => {
      expect(
        assessPushSafety(backupWith({ tasks: 10 }), backupWith({ tasks: 12 }))
          .safe,
      ).toBe(true);
      expect(
        assessPushSafety(backupWith({ tasks: 8 }), backupWith({ tasks: 15 }))
          .safe,
      ).toBe(true);
    });
  });

  describe("decideSyncFlow (No-Dirty-No-Push + conflict guard)", () => {
    it("returns pull with the remote device label when a remote update exists", () => {
      const action = decideSyncFlow({
        shouldPull: true,
        pullDevice: "Office Desktop",
        hasUnsyncedChanges: false,
        safety: { safe: true },
      });
      expect(action).toEqual({ kind: "pull", device: "Office Desktop" });
    });

    it("conflicts and refuses to pull when the remote updated while local is dirty", () => {
      const action = decideSyncFlow({
        shouldPull: true,
        pullDevice: "Office Desktop",
        hasUnsyncedChanges: true,
        safety: { safe: true },
      });
      expect(action).toEqual({ kind: "conflict", device: "Office Desktop" });
    });

    it("conflict carries no device when the remote meta has no label", () => {
      const action = decideSyncFlow({
        shouldPull: true,
        hasUnsyncedChanges: true,
        safety: { safe: true },
      });
      expect(action).toEqual({ kind: "conflict", device: undefined });
    });

    it("never falls through to push when conflict conditions hold", () => {
      const action = decideSyncFlow({
        shouldPull: true,
        hasUnsyncedChanges: true,
        safety: { safe: false, reason: "local-empty" },
      });
      expect(action.kind).toBe("conflict");
    });

    it("returns aligned and refuses to push when local has no changes", () => {
      const action = decideSyncFlow({
        shouldPull: false,
        hasUnsyncedChanges: false,
        safety: { safe: true },
      });
      expect(action).toEqual({ kind: "aligned" });
    });

    it("pushes when local has unsynced changes and the remote is safe to overwrite", () => {
      const action = decideSyncFlow({
        shouldPull: false,
        hasUnsyncedChanges: true,
        safety: { safe: true, counts: { local: 5, remote: 5 } },
      });
      expect(action).toEqual({ kind: "push" });
    });

    it("blocks the push with a DLP reason when the local snapshot is empty", () => {
      const action = decideSyncFlow({
        shouldPull: false,
        hasUnsyncedChanges: true,
        safety: {
          safe: false,
          reason: "local-empty",
          counts: { local: 0, remote: 3 },
        },
      });
      expect(action).toEqual({
        kind: "push-blocked-dlp",
        reason: "local-empty",
        counts: { local: 0, remote: 3 },
      });
    });

    it("blocks the push when the remote is unreadable", () => {
      const action = decideSyncFlow({
        shouldPull: false,
        hasUnsyncedChanges: true,
        safety: { safe: false, reason: "remote-unreadable" },
      });
      expect(action).toEqual({
        kind: "push-blocked-dlp",
        reason: "remote-unreadable",
        counts: { local: 0, remote: 0 },
      });
    });
  });

  describe("shouldPullRemoteCommit data fingerprint", () => {
    it("does not pull when the remote data blob SHA matches the recorded one", () => {
      const res = shouldPullRemoteCommit({
        remoteMeta: {
          version: 1,
          deviceId: "remote-dev",
          deviceLabel: "Office",
          updatedAt: "2026-09-22T09:00:00.000Z",
          dataSha: "blob-abc",
          commitSha: "commit-999",
          appVersion: "1.5.0",
        },
        localDeviceId: "local-dev",
        lastRemoteCommitSha: "commit-999",
        lastRemoteDataSha: "blob-abc",
        lastSyncTime: "2026-09-22T08:00:00.000Z",
      });
      expect(res.shouldPull).toBe(false);
    });

    it("pulls when the remote data blob SHA differs from the recorded one", () => {
      const res = shouldPullRemoteCommit({
        remoteMeta: {
          version: 1,
          deviceId: "remote-dev",
          deviceLabel: "Office",
          updatedAt: "2026-09-22T08:30:00.000Z",
          dataSha: "blob-new",
          commitSha: "commit-999",
          appVersion: "1.5.0",
        },
        localDeviceId: "local-dev",
        lastRemoteCommitSha: "commit-111",
        lastRemoteDataSha: "blob-old",
        lastSyncTime: "2026-09-22T08:00:00.000Z",
      });
      expect(res.shouldPull).toBe(true);
      expect(res.reason).toBe("new-commit");
    });

    it("falls back to commit SHA comparison when local has no recorded data blob", () => {
      const res = shouldPullRemoteCommit({
        remoteMeta: {
          version: 1,
          deviceId: "remote-dev",
          deviceLabel: "Office",
          updatedAt: "2026-09-22T08:30:00.000Z",
          dataSha: "blob-new",
          commitSha: "commit-999",
          appVersion: "1.5.0",
        },
        localDeviceId: "local-dev",
        lastRemoteCommitSha: "commit-111",
        lastRemoteDataSha: null,
        lastSyncTime: "2026-09-22T08:00:00.000Z",
      });
      expect(res.shouldPull).toBe(true);
      expect(res.reason).toBe("new-commit");
    });
  });

  describe("resolveRemoteSyncMeta (metadata fallback)", () => {
    it("uses sync-meta.json directly when it is readable", async () => {
      stubGitHubFetch({
        meta: {
          status: 200,
          body: {
            version: 1,
            deviceId: "mac-1",
            deviceLabel: "MacBook",
            updatedAt: "2026-09-22T02:51:55.385Z",
            appVersion: "1.5.0",
          },
        },
      });

      const res = await resolveRemoteSyncMeta(mockConfig);
      expect(res.fallbackUsed).toBe(false);
      expect(res.meta?.updatedAt).toBe("2026-09-22T02:51:55.385Z");
    });

    it("falls back to kagelin-data.json exportedAt + blob SHA when meta is missing", async () => {
      const remoteData = {
        ...emptyBackup,
        metadata: {
          version: 1,
          appVersion: "1.5.0",
          exportedAt: "2026-09-22T02:51:55.385Z",
        },
      };
      stubGitHubFetch({
        meta: { status: 404 },
        data: { status: 200, body: remoteData },
        blobSha: "blob-sha-xyz",
      });

      const res = await resolveRemoteSyncMeta(mockConfig);
      expect(res.fallbackUsed).toBe(true);
      expect(res.meta?.updatedAt).toBe("2026-09-22T02:51:55.385Z");
      expect(res.meta?.dataSha).toBe("blob-sha-xyz");
      expect(res.meta?.deviceId).toBe("");
    });

    it("returns null meta when neither meta nor data file is readable", async () => {
      stubGitHubFetch({
        meta: { status: 404 },
        data: { status: 500 },
      });

      const res = await resolveRemoteSyncMeta(mockConfig);
      expect(res.meta).toBeNull();
      expect(res.fallbackUsed).toBe(true);
    });
  });

  describe("checkPushSafety (pre-flight)", () => {
    it("treats a missing remote data file as a safe first push", async () => {
      stubGitHubFetch({
        meta: { status: 404 },
        data: { status: 404 },
      });

      const res = await checkPushSafety(mockConfig, emptyBackup);
      expect(res.safe).toBe(true);
      expect(res.remoteMissing).toBe(true);
    });

    it("blocks when local is empty and the remote has data", async () => {
      stubGitHubFetch({
        meta: { status: 404 },
        data: { status: 200, body: backupWith({ tasks: 4 }) },
      });

      const res = await checkPushSafety(mockConfig, emptyBackup);
      expect(res.safe).toBe(false);
      expect(res.reason).toBe("local-empty");
    });

    it("blocks as unreadable when the remote read fails non-404", async () => {
      stubGitHubFetch({
        meta: { status: 500 },
        data: { status: 500 },
      });

      const res = await checkPushSafety(mockConfig, emptyBackup);
      expect(res.safe).toBe(false);
      expect(res.reason).toBe("remote-unreadable");
    });
  });

  describe("fingerprintBackupData (no-op push dedup)", () => {
    it("ignores exportedAt so timestamp-only exports compare equal", () => {
      const base = backupWith({ tasks: 2 });
      const retimed = {
        ...base,
        metadata: {
          ...base.metadata,
          exportedAt: "2026-01-01T00:00:00.000Z",
        },
      };
      expect(fingerprintBackupData(base)).toBe(fingerprintBackupData(retimed));
    });

    it("preserves content differences in the fingerprint", () => {
      expect(fingerprintBackupData(backupWith({ tasks: 2 }))).not.toBe(
        fingerprintBackupData(backupWith({ tasks: 3 })),
      );
    });

    it("keeps appVersion significant (only exportedAt is excluded)", () => {
      const base = backupWith({ tasks: 2 });
      const bumped = {
        ...base,
        metadata: { ...base.metadata, appVersion: "1.6.0" },
      };
      expect(fingerprintBackupData(base)).not.toBe(
        fingerprintBackupData(bumped),
      );
    });
  });
});
