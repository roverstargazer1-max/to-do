import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
  formatBackupBranchSlug,
  buildDefaultBackupBranchName,
  formatBackupCommitMessage,
  getBranchCommitSha,
  checkBranchExists,
  createBranchRef,
  resolveSafeBackupBranchName,
  createBackupBranchSnapshot,
} from "@/lib/sync/github-sync";
import type { BackupData } from "@/lib/backup/types";

describe("github-backup-branch", () => {
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
      appVersion: "1.5.0",
      exportedAt: "2026-09-24T11:00:00.000Z",
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

  describe("formatBackupBranchSlug", () => {
    it("returns empty string for empty, whitespace-only, or invalid character inputs", () => {
      expect(formatBackupBranchSlug("")).toBe("");
      expect(formatBackupBranchSlug("   ")).toBe("");
      expect(formatBackupBranchSlug(":::???***")).toBe("");
      expect(formatBackupBranchSlug("   ---   ")).toBe("");
    });

    it("filters illegal Git branch characters and converts to hyphens", () => {
      expect(formatBackupBranchSlug("clean:db*test?")).toBe("clean-db-test");
      expect(formatBackupBranchSlug("hello~world^ok")).toBe("hello-world-ok");
      expect(formatBackupBranchSlug("archive/data[1]")).toBe("archive-data-1");
    });

    it("converts spaces and multiple consecutive symbols into a single hyphen", () => {
      expect(formatBackupBranchSlug("clean   db")).toBe("clean-db");
      expect(formatBackupBranchSlug("clean---db")).toBe("clean-db");
      expect(formatBackupBranchSlug("  my  feature  tag  ")).toBe(
        "my-feature-tag",
      );
    });

    it("converts uppercase to lowercase", () => {
      expect(formatBackupBranchSlug("CleanDatabase")).toBe("cleandatabase");
      expect(formatBackupBranchSlug("Before Release")).toBe("before-release");
    });

    it("preserves Chinese characters and handles mixed spaces", () => {
      expect(formatBackupBranchSlug("清理 数据库")).toBe("清理-数据库");
      expect(formatBackupBranchSlug("大版本升级 2026")).toBe("大版本升级-2026");
    });

    it("truncates to maxLen (default 15) and removes any trailing hyphens", () => {
      // 20 characters of letters -> exactly 15 chars
      expect(formatBackupBranchSlug("12345678901234567890")).toBe(
        "123456789012345",
      );

      // 15th character happens to be a hyphen -> stripped so it doesn't end in hyphen
      // "hello-world-foo-bar" -> first 15: "hello-world-foo-" -> stripped: "hello-world-foo" (14 chars)
      expect(formatBackupBranchSlug("hello-world-foo-bar")).toBe(
        "hello-world-foo",
      );
      expect(formatBackupBranchSlug("hello-world-foo-bar").endsWith("-")).toBe(
        false,
      );

      // Custom maxLen
      expect(formatBackupBranchSlug("super-long-remark", 8)).toBe("super-lo");
    });

    it("strips leading and trailing hyphens", () => {
      expect(formatBackupBranchSlug("---clean-db---")).toBe("clean-db");
    });
  });

  describe("buildDefaultBackupBranchName", () => {
    const fixedDate = new Date(2026, 8, 24, 11, 30, 0); // 2026-09-24 11:30

    it("formats precise backup/YYYY-MM-DD-HH without remark", () => {
      const name = buildDefaultBackupBranchName(fixedDate);
      expect(name).toBe("backup/2026-09-24-11");
      expect(name.endsWith("-")).toBe(false);
    });

    it("appends slug to backup/YYYY-MM-DD-HH-<slug> when provided", () => {
      const name = buildDefaultBackupBranchName(fixedDate, "clean-db");
      expect(name).toBe("backup/2026-09-24-11-clean-db");
    });

    it("sanitizes raw remark if unformatted slug is provided", () => {
      const name = buildDefaultBackupBranchName(fixedDate, "Clean DB: v2!");
      expect(name).toBe("backup/2026-09-24-11-clean-db-v2");
    });

    it("does not append trailing hyphen when slug is whitespace or empty", () => {
      expect(buildDefaultBackupBranchName(fixedDate, "")).toBe(
        "backup/2026-09-24-11",
      );
      expect(buildDefaultBackupBranchName(fixedDate, "   ")).toBe(
        "backup/2026-09-24-11",
      );
      expect(buildDefaultBackupBranchName(fixedDate, "???")).toBe(
        "backup/2026-09-24-11",
      );
    });
  });

  describe("formatBackupCommitMessage", () => {
    const fixedDate = new Date(2026, 8, 24, 11, 0, 0);

    it("returns backup: <remark> when remark is provided", () => {
      expect(
        formatBackupCommitMessage("Clean database before v2", fixedDate),
      ).toBe("backup: Clean database before v2");
      expect(formatBackupCommitMessage("   spaced remark   ", fixedDate)).toBe(
        "backup: spaced remark",
      );
    });

    it("falls back to backup: <YYYY-MM-DD HH>h when remark is absent or empty", () => {
      expect(formatBackupCommitMessage(undefined, fixedDate)).toBe(
        "backup: 2026-09-24 11h",
      );
      expect(formatBackupCommitMessage("", fixedDate)).toBe(
        "backup: 2026-09-24 11h",
      );
      expect(formatBackupCommitMessage("   ", fixedDate)).toBe(
        "backup: 2026-09-24 11h",
      );
    });
  });

  describe("getBranchCommitSha", () => {
    it("queries commits endpoint and extracts SHA", async () => {
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          sha: "base-sha-123456",
        }),
      });

      const sha = await getBranchCommitSha(mockConfig, "main");
      expect(sha).toBe("base-sha-123456");

      const [url, init] = (global.fetch as Mock).mock.calls[0];
      expect(url).toBe(
        "https://api.github.com/repos/testuser/my-repo/commits/main",
      );
      expect(init.headers.Authorization).toBe("Bearer ghp_testtoken12345");
    });

    it("returns null when branch does not exist or API fails", async () => {
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const sha = await getBranchCommitSha(mockConfig, "nonexistent");
      expect(sha).toBeNull();
    });
  });

  describe("checkBranchExists", () => {
    it("returns true on HTTP 200", async () => {
      (global.fetch as Mock).mockResolvedValueOnce({
        status: 200,
      });

      const exists = await checkBranchExists(
        mockConfig,
        "backup/2026-09-24-11",
      );
      expect(exists).toBe(true);
    });

    it("returns false on HTTP 404", async () => {
      (global.fetch as Mock).mockResolvedValueOnce({
        status: 404,
      });

      const exists = await checkBranchExists(
        mockConfig,
        "backup/2026-09-24-11",
      );
      expect(exists).toBe(false);
    });
  });

  describe("createBranchRef", () => {
    it("creates Git reference via POST /git/refs", async () => {
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          ref: "refs/heads/backup/2026-09-24-11",
          object: { sha: "base-commit-sha-789" },
        }),
      });

      const res = await createBranchRef(
        mockConfig,
        "backup/2026-09-24-11",
        "base-commit-sha-789",
      );

      expect(res.success).toBe(true);
      expect(res.ref).toBe("refs/heads/backup/2026-09-24-11");
      expect(res.sha).toBe("base-commit-sha-789");

      const [url, init] = (global.fetch as Mock).mock.calls[0];
      expect(url).toBe(
        "https://api.github.com/repos/testuser/my-repo/git/refs",
      );
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual({
        ref: "refs/heads/backup/2026-09-24-11",
        sha: "base-commit-sha-789",
      });
    });

    it("returns failure on error response", async () => {
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({
          message: "Reference already exists",
        }),
      });

      const res = await createBranchRef(
        mockConfig,
        "backup/2026-09-24-11",
        "base-commit-sha-789",
      );

      expect(res.success).toBe(false);
      expect(res.status).toBe(422);
      expect(res.error).toBe("Reference already exists");
    });
  });

  describe("resolveSafeBackupBranchName", () => {
    it("uses original branch name if remote does not exist", async () => {
      (global.fetch as Mock).mockResolvedValueOnce({
        status: 404, // target does not exist
      });

      const safeName = await resolveSafeBackupBranchName(
        mockConfig,
        "backup/2026-09-24-11",
      );
      expect(safeName).toBe("backup/2026-09-24-11");
    });

    it("appends -1 if original branch exists (HTTP 200)", async () => {
      (global.fetch as Mock)
        .mockResolvedValueOnce({ status: 200 }) // backup/2026-09-24-11 exists
        .mockResolvedValueOnce({ status: 404 }); // backup/2026-09-24-11-1 available

      const safeName = await resolveSafeBackupBranchName(
        mockConfig,
        "backup/2026-09-24-11",
      );
      expect(safeName).toBe("backup/2026-09-24-11-1");
    });

    it("increments to -2 if both original and -1 exist", async () => {
      (global.fetch as Mock)
        .mockResolvedValueOnce({ status: 200 }) // target exists
        .mockResolvedValueOnce({ status: 200 }) // target-1 exists
        .mockResolvedValueOnce({ status: 404 }); // target-2 available

      const safeName = await resolveSafeBackupBranchName(
        mockConfig,
        "backup/2026-09-24-11",
      );
      expect(safeName).toBe("backup/2026-09-24-11-2");
    });
  });

  describe("createBackupBranchSnapshot orchestration", () => {
    const fixedDate = new Date(2026, 8, 24, 11, 0, 0);

    it("successfully creates backup branch and commits local snapshot (no remark)", async () => {
      const originalConfig = { ...mockConfig };

      (global.fetch as Mock).mockImplementation(
        (url: string, init?: RequestInit) => {
          const u = String(url);

          // 1. Query base branch SHA
          if (u.includes("/commits/main")) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ sha: "base-sha-main-123" }),
            });
          }

          // 2. Existence probe for target branch
          if (u.includes("/branches/backup%2F2026-09-24-11")) {
            return Promise.resolve({
              status: 404,
            });
          }

          // 3. Create branch ref via POST /git/refs
          if (u.includes("/git/refs") && init?.method === "POST") {
            return Promise.resolve({
              ok: true,
              status: 201,
              json: async () => ({
                ref: "refs/heads/backup/2026-09-24-11",
                object: { sha: "base-sha-main-123" },
              }),
            });
          }

          // 4. File SHA checks on new branch
          if (u.includes("/contents/") && init?.method !== "PUT") {
            return Promise.resolve({
              ok: false,
              status: 404,
            });
          }

          // 5. Upload data & meta files on new branch
          if (
            u.includes("/contents/kagelin-data.json") &&
            init?.method === "PUT"
          ) {
            const body = JSON.parse(String(init.body));
            expect(body.branch).toBe("backup/2026-09-24-11");
            expect(body.message).toBe("backup: 2026-09-24 11h");
            return Promise.resolve({
              ok: true,
              status: 201,
              json: async () => ({
                commit: { sha: "new-commit-sha-data" },
                content: { sha: "data-blob-sha-abc" },
              }),
            });
          }

          if (
            u.includes("/contents/sync-meta.json") &&
            init?.method === "PUT"
          ) {
            const body = JSON.parse(String(init.body));
            expect(body.branch).toBe("backup/2026-09-24-11");
            return Promise.resolve({
              ok: true,
              status: 201,
              json: async () => ({
                commit: { sha: "new-commit-sha-meta" },
                content: { sha: "meta-blob-sha-xyz" },
              }),
            });
          }

          throw new Error(`Unexpected fetch call: ${u}`);
        },
      );

      const res = await createBackupBranchSnapshot(mockConfig, {
        data: sampleBackupData,
        now: fixedDate,
      });

      expect(res.success).toBe(true);
      expect(res.branchName).toBe("backup/2026-09-24-11");
      expect(res.commitSha).toBe("new-commit-sha-data");
      expect(res.viewUrl).toBe(
        "https://github.com/testuser/my-repo/tree/backup/2026-09-24-11",
      );

      // Verify original config branch was NOT mutated
      expect(mockConfig.branch).toBe(originalConfig.branch);
    });

    it("successfully creates backup branch with remark and slug", async () => {
      (global.fetch as Mock).mockImplementation(
        (url: string, init?: RequestInit) => {
          const u = String(url);

          if (u.includes("/commits/main")) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ sha: "base-sha-main-123" }),
            });
          }

          if (u.includes("/branches/backup%2F2026-09-24-11-clean-db")) {
            return Promise.resolve({ status: 404 });
          }

          if (u.includes("/git/refs") && init?.method === "POST") {
            return Promise.resolve({
              ok: true,
              status: 201,
              json: async () => ({
                ref: "refs/heads/backup/2026-09-24-11-clean-db",
                object: { sha: "base-sha-main-123" },
              }),
            });
          }

          if (u.includes("/contents/") && init?.method !== "PUT") {
            return Promise.resolve({ ok: false, status: 404 });
          }

          if (
            u.includes("/contents/kagelin-data.json") &&
            init?.method === "PUT"
          ) {
            const body = JSON.parse(String(init.body));
            expect(body.branch).toBe("backup/2026-09-24-11-clean-db");
            expect(body.message).toBe("backup: Clean DB");
            return Promise.resolve({
              ok: true,
              status: 201,
              json: async () => ({
                commit: { sha: "new-commit-clean-db" },
                content: { sha: "blob-sha-123" },
              }),
            });
          }

          if (
            u.includes("/contents/sync-meta.json") &&
            init?.method === "PUT"
          ) {
            return Promise.resolve({
              ok: true,
              status: 201,
              json: async () => ({
                commit: { sha: "meta-sha" },
              }),
            });
          }

          throw new Error(`Unexpected fetch call: ${u}`);
        },
      );

      const res = await createBackupBranchSnapshot(mockConfig, {
        remark: "Clean DB",
        data: sampleBackupData,
        now: fixedDate,
      });

      expect(res.success).toBe(true);
      expect(res.branchName).toBe("backup/2026-09-24-11-clean-db");
      expect(res.viewUrl).toBe(
        "https://github.com/testuser/my-repo/tree/backup/2026-09-24-11-clean-db",
      );
    });

    it("auto-increments branch suffix when collision occurs", async () => {
      (global.fetch as Mock).mockImplementation(
        (url: string, init?: RequestInit) => {
          const u = String(url);

          if (u.includes("/commits/main")) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ sha: "base-sha-main-123" }),
            });
          }

          // Candidate -1 does not exist (404), checked before base branch to avoid prefix match
          if (u.includes("/branches/backup%2F2026-09-24-11-1")) {
            return Promise.resolve({ status: 404 });
          }
          if (u.includes("/branches/backup%2F2026-09-24-11")) {
            return Promise.resolve({ status: 200 });
          }

          if (u.includes("/git/refs") && init?.method === "POST") {
            const body = JSON.parse(String(init.body));
            expect(body.ref).toBe("refs/heads/backup/2026-09-24-11-1");
            return Promise.resolve({
              ok: true,
              status: 201,
              json: async () => ({
                ref: "refs/heads/backup/2026-09-24-11-1",
                object: { sha: "base-sha-main-123" },
              }),
            });
          }

          if (u.includes("/contents/") && init?.method !== "PUT") {
            return Promise.resolve({ ok: false, status: 404 });
          }

          if (
            u.includes("/contents/kagelin-data.json") &&
            init?.method === "PUT"
          ) {
            return Promise.resolve({
              ok: true,
              status: 201,
              json: async () => ({
                commit: { sha: "sha-inc-1" },
              }),
            });
          }

          if (
            u.includes("/contents/sync-meta.json") &&
            init?.method === "PUT"
          ) {
            return Promise.resolve({
              ok: true,
              status: 201,
              json: async () => ({
                commit: { sha: "meta-inc-1" },
              }),
            });
          }

          throw new Error(`Unexpected fetch call: ${u}`);
        },
      );

      const res = await createBackupBranchSnapshot(mockConfig, {
        data: sampleBackupData,
        now: fixedDate,
      });

      expect(res.success).toBe(true);
      expect(res.branchName).toBe("backup/2026-09-24-11-1");
      expect(res.viewUrl).toBe(
        "https://github.com/testuser/my-repo/tree/backup/2026-09-24-11-1",
      );
    });

    it("recovers via increment if ref creation returns 422 collision", async () => {
      let refAttempt = 0;
      (global.fetch as Mock).mockImplementation(
        (url: string, init?: RequestInit) => {
          const u = String(url);

          if (u.includes("/commits/main")) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ sha: "base-sha-main-123" }),
            });
          }

          // Probe returned 404, but POST hits race condition 422
          if (u.includes("/branches/")) {
            return Promise.resolve({ status: 404 });
          }

          if (u.includes("/git/refs") && init?.method === "POST") {
            refAttempt++;
            if (refAttempt === 1) {
              return Promise.resolve({
                ok: false,
                status: 422,
                json: async () => ({ message: "Reference already exists" }),
              });
            }
            return Promise.resolve({
              ok: true,
              status: 201,
              json: async () => ({
                ref: "refs/heads/backup/2026-09-24-11-1",
                object: { sha: "base-sha-main-123" },
              }),
            });
          }

          if (u.includes("/contents/") && init?.method !== "PUT") {
            return Promise.resolve({ ok: false, status: 404 });
          }

          if (
            u.includes("/contents/kagelin-data.json") &&
            init?.method === "PUT"
          ) {
            return Promise.resolve({
              ok: true,
              status: 201,
              json: async () => ({ commit: { sha: "sha-recovered" } }),
            });
          }

          if (
            u.includes("/contents/sync-meta.json") &&
            init?.method === "PUT"
          ) {
            return Promise.resolve({
              ok: true,
              status: 201,
              json: async () => ({ commit: { sha: "meta-recovered" } }),
            });
          }

          throw new Error(`Unexpected fetch call: ${u}`);
        },
      );

      const res = await createBackupBranchSnapshot(mockConfig, {
        data: sampleBackupData,
        now: fixedDate,
      });

      expect(res.success).toBe(true);
      expect(res.branchName).toBe("backup/2026-09-24-11-1");
    });

    it("returns error when base branch commit SHA cannot be retrieved", async () => {
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const res = await createBackupBranchSnapshot(mockConfig, {
        data: sampleBackupData,
        now: fixedDate,
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe("settings.github.error.baseBranchNotFound");
    });

    it("returns error when file upload fails", async () => {
      (global.fetch as Mock).mockImplementation(
        (url: string, init?: RequestInit) => {
          const u = String(url);

          if (u.includes("/commits/main")) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ sha: "base-sha-123" }),
            });
          }

          if (u.includes("/branches/")) {
            return Promise.resolve({ status: 404 });
          }

          if (u.includes("/git/refs") && init?.method === "POST") {
            return Promise.resolve({
              ok: true,
              status: 201,
              json: async () => ({
                ref: "refs/heads/backup/2026-09-24-11",
                object: { sha: "base-sha-123" },
              }),
            });
          }

          if (u.includes("/contents/") && init?.method !== "PUT") {
            return Promise.resolve({ ok: false, status: 404 });
          }

          // Upload fails with 500
          if (
            u.includes("/contents/kagelin-data.json") &&
            init?.method === "PUT"
          ) {
            return Promise.resolve({
              ok: false,
              status: 500,
              json: async () => ({ message: "Internal Server Error" }),
            });
          }

          throw new Error(`Unexpected fetch call: ${u}`);
        },
      );

      const res = await createBackupBranchSnapshot(mockConfig, {
        data: sampleBackupData,
        now: fixedDate,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Internal Server Error");
    });

    it("validates missing token or invalid repo format", async () => {
      const resToken = await createBackupBranchSnapshot(
        { ...mockConfig, token: "   " },
        { data: sampleBackupData, now: fixedDate },
      );
      expect(resToken.success).toBe(false);
      expect(resToken.error).toBe("settings.github.error.missingToken");

      const resRepo = await createBackupBranchSnapshot(
        { ...mockConfig, repo: "invalidrepo" },
        { data: sampleBackupData, now: fixedDate },
      );
      expect(resRepo.success).toBe(false);
      expect(resRepo.error).toBe("settings.github.error.invalidRepoFormat");
    });
  });
});
