import { renderHook, act } from "@testing-library/react";
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { useSmartSync } from "@/lib/hooks/useSmartSync";
import { useGitHubSyncStore } from "@/lib/store/githubSyncStore";
import {
  DATA_FILE_PATH,
  META_FILE_PATH,
  type GitHubSyncMeta,
} from "@/lib/sync/github-sync";
import type { BackupData } from "@/lib/backup/types";
import { emptyBackup, backupWith } from "../../support/backupDataFixtures";

const {
  collectLocalBackupDataMock,
  restoreLocalBackupDataMock,
  notifyMocks,
  trMock,
} = vi.hoisted(() => ({
  collectLocalBackupDataMock: vi.fn(),
  restoreLocalBackupDataMock: vi.fn(),
  notifyMocks: {
    default: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    promise: vi.fn(),
  },
  trMock: vi.fn((key: string) => key),
}));

vi.mock("@/lib/backup/local-backup", () => ({
  collectLocalBackupData: collectLocalBackupDataMock,
  restoreLocalBackupData: restoreLocalBackupDataMock,
}));

vi.mock("@/lib/notify", () => ({ notify: notifyMocks }));

vi.mock("@/lib/i18n/tr", () => ({ tr: trMock }));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

function remoteMetaFixture(
  overrides: Partial<GitHubSyncMeta> = {},
): GitHubSyncMeta {
  return {
    version: 1,
    deviceId: "remote-device",
    deviceLabel: "Office Desktop",
    updatedAt: "2026-09-22T09:00:00.000Z",
    dataSha: "blob-remote",
    commitSha: "commit-remote",
    appVersion: "1.5.0",
    ...overrides,
  };
}

interface FetchScenario {
  meta?: { status: number; body?: unknown };
  data?: { status: number; body?: BackupData };
  blobSha?: string;
}

/** Shape of the responses the stub returns (loose on purpose: the real
 * github-sync module is the only consumer and treats these as fetch results). */
interface StubFetchResponse {
  ok: boolean;
  status: number;
  text?: () => Promise<string>;
  json?: () => Promise<unknown>;
}

/** GitHub API fetch stub that also records every upload (PUT) request. */
function stubGitHubFetch(scenario: FetchScenario = {}): {
  putUrls: string[];
  fetchMock: Mock;
} {
  const putUrls: string[] = [];
  const fetchMock = vi.fn(
    async (
      urlInput: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<StubFetchResponse> => {
      const url = String(urlInput);
      const method = (init?.method ?? "GET").toUpperCase();
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const isRaw = headers["Accept"] === "application/vnd.github.raw+json";

      if (method === "PUT") {
        putUrls.push(url);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            commit: { sha: "commit-put" },
            content: { sha: "blob-put" },
          }),
          text: async () => "",
        };
      }

      if (url.includes(META_FILE_PATH)) {
        const meta = scenario.meta;
        if (isRaw) {
          if (!meta || meta.status !== 200) {
            return {
              ok: false,
              status: meta?.status ?? 404,
              text: async () => "",
            };
          }
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify(meta.body),
          };
        }
        // Contents (blob SHA) endpoint
        if (!meta || meta.status !== 200) {
          return { ok: false, status: 404 };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ sha: "meta-sha" }),
        };
      }

      if (url.includes(DATA_FILE_PATH)) {
        const data = scenario.data;
        if (isRaw) {
          if (!data || data.status !== 200) {
            return {
              ok: false,
              status: data?.status ?? 404,
              text: async () => "",
            };
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

      return { ok: false, status: 500, text: async () => "" };
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return { putUrls, fetchMock };
}

describe("useSmartSync orchestration", () => {
  beforeEach(() => {
    useGitHubSyncStore.getState().clearConfig();
    useGitHubSyncStore.setState({
      token: "ghp_testtoken",
      repo: "testuser/my-repo",
      branch: "main",
      deviceLabel: "MacBook Test",
      hasUnsyncedChanges: false,
      lastRemoteDataSha: null,
      lastSyncTime: null,
    });
    collectLocalBackupDataMock.mockReset();
    restoreLocalBackupDataMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns aligned and never uploads when local is clean and remote is in sync", async () => {
    useGitHubSyncStore.setState({
      hasUnsyncedChanges: false,
      lastRemoteDataSha: "blob-remote",
    });
    const { putUrls } = stubGitHubFetch({
      meta: { status: 200, body: remoteMetaFixture() },
      data: { status: 200, body: backupWith({ tasks: 3 }) },
    });

    const { result } = renderHook(() => useSmartSync());
    await act(async () => {
      await result.current.run();
    });

    expect(result.current.dlp).toBeNull();
    expect(notifyMocks.success).toHaveBeenCalledWith(
      "settings.github.toast.alreadyInSync",
    );
    expect(collectLocalBackupDataMock).not.toHaveBeenCalled();
    expect(putUrls).toHaveLength(0);
  });

  it("holds a DLP confirmation (no upload) when an empty local would overwrite a populated remote", async () => {
    useGitHubSyncStore.setState({
      hasUnsyncedChanges: true,
      lastRemoteDataSha: "blob-remote",
    });
    collectLocalBackupDataMock.mockResolvedValue(emptyBackup);
    const { putUrls } = stubGitHubFetch({
      meta: { status: 200, body: remoteMetaFixture() },
      data: { status: 200, body: backupWith({ tasks: 3 }) },
    });

    const { result } = renderHook(() => useSmartSync());
    await act(async () => {
      await result.current.run();
    });

    expect(result.current.dlp).toEqual({
      reason: "local-empty",
      counts: { local: 0, remote: 3 },
    });
    expect(putUrls).toHaveLength(0);
    expect(notifyMocks.success).not.toHaveBeenCalled();
  });

  it("uploads only after the held DLP push is confirmed", async () => {
    useGitHubSyncStore.setState({
      hasUnsyncedChanges: true,
      lastRemoteDataSha: "blob-remote",
    });
    collectLocalBackupDataMock.mockResolvedValue(emptyBackup);
    const { putUrls } = stubGitHubFetch({
      meta: { status: 200, body: remoteMetaFixture() },
      data: { status: 200, body: backupWith({ tasks: 3 }) },
    });

    const { result } = renderHook(() => useSmartSync());
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.dlp).not.toBeNull();
    expect(putUrls).toHaveLength(0);

    await act(async () => {
      await result.current.confirmDlp();
    });

    expect(result.current.dlp).toBeNull();
    expect(putUrls.length).toBeGreaterThan(0);
    expect(putUrls.every((url) => url.includes("/contents/"))).toBe(true);
    expect(notifyMocks.success).toHaveBeenCalledWith(
      "settings.github.toast.pushSuccess",
    );
  });

  it("cancelDlp aborts the held push without any upload", async () => {
    useGitHubSyncStore.setState({
      hasUnsyncedChanges: true,
      lastRemoteDataSha: "blob-remote",
    });
    collectLocalBackupDataMock.mockResolvedValue(emptyBackup);
    const { putUrls } = stubGitHubFetch({
      meta: { status: 200, body: remoteMetaFixture() },
      data: { status: 200, body: backupWith({ tasks: 3 }) },
    });

    const { result } = renderHook(() => useSmartSync());
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.dlp).not.toBeNull();

    act(() => {
      result.current.cancelDlp();
    });

    expect(result.current.dlp).toBeNull();
    expect(putUrls).toHaveLength(0);
    expect(notifyMocks.success).not.toHaveBeenCalled();
  });

  it("refuses to pull on conflict, flags the store, and leaves local data untouched", async () => {
    useGitHubSyncStore.setState({
      hasUnsyncedChanges: true,
      lastRemoteDataSha: "blob-old",
    });
    const { putUrls } = stubGitHubFetch({
      meta: { status: 200, body: remoteMetaFixture() },
    });

    const { result } = renderHook(() => useSmartSync());
    await act(async () => {
      await result.current.run();
    });

    expect(useGitHubSyncStore.getState().status).toBe("conflict");
    expect(notifyMocks.warning).toHaveBeenCalledWith(
      "settings.github.toast.remoteUpdateConflict",
    );
    expect(trMock).toHaveBeenCalledWith(
      "settings.github.toast.remoteUpdateConflict",
      { device: "Office Desktop" },
    );
    expect(restoreLocalBackupDataMock).not.toHaveBeenCalled();
    expect(result.current.dlp).toBeNull();
    expect(putUrls).toHaveLength(0);
  });

  it("pulls and restores the remote snapshot when remote updated and local is clean", async () => {
    useGitHubSyncStore.setState({
      hasUnsyncedChanges: false,
      lastRemoteDataSha: "blob-old",
    });
    const remoteData = backupWith({ tasks: 2 });
    const { putUrls } = stubGitHubFetch({
      meta: { status: 200, body: remoteMetaFixture() },
      data: { status: 200, body: remoteData },
    });

    const { result } = renderHook(() => useSmartSync());
    await act(async () => {
      await result.current.run();
    });

    expect(restoreLocalBackupDataMock).toHaveBeenCalledWith(remoteData);
    expect(notifyMocks.success).toHaveBeenCalledWith(
      "settings.github.toast.autoPulled",
    );
    expect(putUrls).toHaveLength(0);
  });

  it("shows a fallback notice when sync-meta.json is missing", async () => {
    useGitHubSyncStore.setState({
      hasUnsyncedChanges: false,
      lastRemoteDataSha: "blob-old",
    });
    const remoteData: BackupData = {
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
      blobSha: "blob-fallback",
    });

    const { result } = renderHook(() => useSmartSync());
    await act(async () => {
      await result.current.run();
    });

    expect(notifyMocks.warning).toHaveBeenCalledWith(
      "settings.github.toast.metaFallback",
    );
    expect(restoreLocalBackupDataMock).toHaveBeenCalledWith(remoteData);
  });

  it("manual push holds a DLP confirmation instead of uploading", async () => {
    useGitHubSyncStore.setState({
      hasUnsyncedChanges: true,
      lastRemoteDataSha: "blob-remote",
    });
    collectLocalBackupDataMock.mockResolvedValue(emptyBackup);
    const { putUrls } = stubGitHubFetch({
      meta: { status: 200, body: remoteMetaFixture() },
      data: { status: 200, body: backupWith({ tasks: 3 }) },
    });

    const { result } = renderHook(() => useSmartSync());
    await act(async () => {
      await result.current.runPush();
    });

    expect(result.current.dlp).toEqual({
      reason: "local-empty",
      counts: { local: 0, remote: 3 },
    });
    expect(putUrls).toHaveLength(0);

    await act(async () => {
      await result.current.confirmDlp();
    });
    expect(putUrls.length).toBeGreaterThan(0);
    expect(notifyMocks.success).toHaveBeenCalledWith(
      "settings.github.toast.pushSuccess",
    );
  });

  it("manual push uploads when the remote is safe to overwrite", async () => {
    useGitHubSyncStore.setState({
      hasUnsyncedChanges: true,
      lastRemoteDataSha: "blob-remote",
    });
    collectLocalBackupDataMock.mockResolvedValue(backupWith({ tasks: 5 }));
    const { putUrls } = stubGitHubFetch({
      meta: { status: 200, body: remoteMetaFixture() },
      data: { status: 200, body: backupWith({ tasks: 3 }) },
    });

    const { result } = renderHook(() => useSmartSync());
    await act(async () => {
      await result.current.runPush();
    });

    expect(result.current.dlp).toBeNull();
    expect(putUrls.length).toBeGreaterThan(0);
    expect(notifyMocks.success).toHaveBeenCalledWith(
      "settings.github.toast.pushSuccess",
    );
  });
});
