import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
  normalizeRepo,
  utf8ToBase64,
  base64ToUtf8,
  testGitHubConnection,
  downloadDataFromGitHub,
  uploadDataToGitHub,
  DATA_FILE_PATH,
  META_FILE_PATH,
} from "@/lib/sync/github-sync";
import type { BackupData } from "@/lib/backup/types";

describe("github-sync", () => {
  const mockConfig = {
    token: "ghp_testtoken12345",
    repo: "testuser/my-repo",
    branch: "main",
    deviceLabel: "MacBook Test",
    deviceId: "device-123",
  };

  const sampleBackupData: BackupData = {
    metadata: {
      version: 1,
      appVersion: "1.3.0",
      exportedAt: "2026-09-21T08:00:00.000Z",
    },
    tasks: [],
    projects: [],
    habits: [],
    habit_entries: [],
    focus_logs: [],
    events: [],
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  describe("helper functions", () => {
    it("normalizes various repo input formats", () => {
      expect(normalizeRepo("user/repo")).toBe("user/repo");
      expect(normalizeRepo("https://github.com/user/repo")).toBe("user/repo");
      expect(normalizeRepo("https://github.com/user/repo.git")).toBe(
        "user/repo",
      );
      expect(normalizeRepo("  user/repo/ ")).toBe("user/repo");
    });

    it("encodes and decodes utf-8 unicode including Chinese and emojis safely", () => {
      const text = "你好，世界！🚀 待办任务：写代码 & 整理桌面";
      const b64 = utf8ToBase64(text);
      const decoded = base64ToUtf8(b64);
      expect(decoded).toBe(text);
    });
  });

  describe("testGitHubConnection", () => {
    it("fails when repo format is invalid", async () => {
      const res = await testGitHubConnection({
        ...mockConfig,
        repo: "invalidrepo",
      });
      expect(res.success).toBe(false);
      expect(res.error).toBe("settings.github.error.invalidRepoFormat");
    });

    it("fails when token is empty", async () => {
      const res = await testGitHubConnection({ ...mockConfig, token: "   " });
      expect(res.success).toBe(false);
      expect(res.error).toBe("settings.github.error.missingToken");
    });

    it("returns success for valid credentials", async () => {
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          full_name: "testuser/my-repo",
          default_branch: "main",
        }),
      });

      const res = await testGitHubConnection(mockConfig);
      expect(res.success).toBe(true);
      expect(res.repoFullName).toBe("testuser/my-repo");
    });

    it("handles 401 Unauthorized", async () => {
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const res = await testGitHubConnection(mockConfig);
      expect(res.success).toBe(false);
      expect(res.error).toBe("settings.github.error.badCredentials");
    });

    it("handles 404 Not Found", async () => {
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const res = await testGitHubConnection(mockConfig);
      expect(res.success).toBe(false);
      expect(res.error).toBe("settings.github.error.repoNotFound");
    });
  });

  describe("downloadDataFromGitHub", () => {
    it("returns error if data file is not found (404)", async () => {
      (global.fetch as Mock).mockImplementation(async (url: string) => {
        if (url.includes(META_FILE_PATH)) {
          return { ok: false, status: 404 };
        }
        if (url.includes(DATA_FILE_PATH)) {
          return { ok: false, status: 404 };
        }
        return { ok: false, status: 500 };
      });

      const res = await downloadDataFromGitHub(mockConfig);
      expect(res.success).toBe(false);
      expect(res.error).toBe("settings.github.error.dataNotFoundOnRemote");
    });

    it("downloads and parses backup data and meta successfully", async () => {
      const meta = {
        version: 1,
        deviceId: "mac-1",
        deviceLabel: "MacBook",
        updatedAt: "2026-09-21T08:30:00.000Z",
        appVersion: "1.3.0",
      };

      (global.fetch as Mock).mockImplementation(async (url: string) => {
        if (url.includes(META_FILE_PATH)) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify(meta),
          };
        }
        if (url.includes(DATA_FILE_PATH)) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify(sampleBackupData),
          };
        }
        return { ok: false, status: 500 };
      });

      const res = await downloadDataFromGitHub(mockConfig);
      expect(res.success).toBe(true);
      expect(res.data?.metadata.appVersion).toBe("1.3.0");
      expect(res.meta?.deviceLabel).toBe("MacBook");
    });
  });

  describe("uploadDataToGitHub", () => {
    it("uploads data and metadata correctly", async () => {
      (global.fetch as Mock).mockImplementation(
        async (url: string, options?: RequestInit) => {
          // Querying existing SHAs
          if (options?.method !== "PUT") {
            return {
              ok: true,
              status: 200,
              json: async () => ({ sha: "old-sha-123" }),
            };
          }
          // PUT data or meta
          return {
            ok: true,
            status: 200,
            json: async () => ({
              commit: { sha: "new-commit-sha-789" },
              content: { sha: "new-content-sha-456" },
            }),
          };
        },
      );

      const res = await uploadDataToGitHub(mockConfig, sampleBackupData);
      expect(res.success).toBe(true);
      expect(res.commitSha).toBe("new-commit-sha-789");
      expect(res.meta?.deviceLabel).toBe("MacBook Test");
    });

    it("returns conflict error when 409 is received", async () => {
      (global.fetch as Mock).mockImplementation(
        async (url: string, options?: RequestInit) => {
          if (options?.method === "PUT") {
            return {
              ok: false,
              status: 409,
              json: async () => ({ message: "Conflict" }),
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ sha: "sha" }),
          };
        },
      );

      const res = await uploadDataToGitHub(mockConfig, sampleBackupData);
      expect(res.success).toBe(false);
      expect(res.error).toBe("settings.github.error.conflict");
    });
  });
});
