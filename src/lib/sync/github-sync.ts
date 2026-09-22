import type { BackupData } from "@/lib/backup/types";

export interface GitHubSyncConfig {
  token: string;
  repo: string;
  branch?: string;
  deviceLabel?: string;
  deviceId?: string;
}

export interface GitHubSyncMeta {
  version: number;
  deviceId: string;
  deviceLabel: string;
  updatedAt: string;
  dataSha?: string;
  commitSha?: string;
  appVersion: string;
}

export interface GitHubSyncResult {
  success: boolean;
  error?: string;
  meta?: GitHubSyncMeta;
  data?: BackupData;
  commitSha?: string;
}

export const DATA_FILE_PATH = "kagelin-data.json";
export const META_FILE_PATH = "sync-meta.json";

export function normalizeRepo(repoInput: string): string {
  let trimmed = repoInput.trim();
  trimmed = trimmed.replace(/^https?:\/\/github\.com\//, "");
  trimmed = trimmed.replace(/\.git$/, "");
  trimmed = trimmed.replace(/^\//, "").replace(/\/$/, "");
  return trimmed;
}

export function utf8ToBase64(str: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "utf-8").toString("base64");
  }
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToUtf8(base64: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(base64, "base64").toString("utf-8");
  }
  const binary = atob(base64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function getHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token.trim()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export async function testGitHubConnection(config: GitHubSyncConfig): Promise<{
  success: boolean;
  error?: string;
  repoFullName?: string;
  defaultBranch?: string;
}> {
  const repo = normalizeRepo(config.repo);
  if (!repo || !repo.includes("/")) {
    return {
      success: false,
      error: "settings.github.error.invalidRepoFormat",
    };
  }
  if (!config.token.trim()) {
    return {
      success: false,
      error: "settings.github.error.missingToken",
    };
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: getHeaders(config.token),
    });

    if (res.status === 401) {
      return { success: false, error: "settings.github.error.badCredentials" };
    }
    if (res.status === 404) {
      return { success: false, error: "settings.github.error.repoNotFound" };
    }
    if (res.status === 403) {
      return { success: false, error: "settings.github.error.forbidden" };
    }
    if (!res.ok) {
      return { success: false, error: `GitHub API error: ${res.status}` };
    }

    const data = await res.json();
    return {
      success: true,
      repoFullName: data.full_name,
      defaultBranch: data.default_branch || "main",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

interface GitHubFileContentResponse {
  sha: string;
  content?: string;
  size?: number;
}

export async function getRemoteFileSha(
  config: GitHubSyncConfig,
  path: string,
): Promise<string | null> {
  const repo = normalizeRepo(config.repo);
  const branch = config.branch || "main";
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
      {
        headers: getHeaders(config.token),
      },
    );
    if (!res.ok) {
      return null;
    }
    const json = (await res.json()) as GitHubFileContentResponse;
    return json.sha || null;
  } catch {
    return null;
  }
}

export async function getRemoteSyncMeta(
  config: GitHubSyncConfig,
): Promise<GitHubSyncMeta | null> {
  const repo = normalizeRepo(config.repo);
  const branch = config.branch || "main";

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/contents/${META_FILE_PATH}?ref=${encodeURIComponent(branch)}`,
      {
        headers: {
          ...getHeaders(config.token),
          Accept: "application/vnd.github.raw+json",
        },
      },
    );

    if (!res.ok) {
      return null;
    }

    const text = await res.text();
    const meta = JSON.parse(text) as GitHubSyncMeta;
    return meta;
  } catch {
    return null;
  }
}

export async function downloadDataFromGitHub(
  config: GitHubSyncConfig,
): Promise<GitHubSyncResult> {
  const repo = normalizeRepo(config.repo);
  const branch = config.branch || "main";

  try {
    const [metaRes, dataRes] = await Promise.all([
      fetch(
        `https://api.github.com/repos/${repo}/contents/${META_FILE_PATH}?ref=${encodeURIComponent(branch)}`,
        {
          headers: {
            ...getHeaders(config.token),
            Accept: "application/vnd.github.raw+json",
          },
        },
      ),
      fetch(
        `https://api.github.com/repos/${repo}/contents/${DATA_FILE_PATH}?ref=${encodeURIComponent(branch)}`,
        {
          headers: {
            ...getHeaders(config.token),
            Accept: "application/vnd.github.raw+json",
          },
        },
      ),
    ]);

    if (dataRes.status === 404) {
      return {
        success: false,
        error: "settings.github.error.dataNotFoundOnRemote",
      };
    }

    if (!dataRes.ok) {
      return {
        success: false,
        error: `Failed to fetch data: HTTP ${dataRes.status}`,
      };
    }

    const dataText = await dataRes.text();
    const backupData = JSON.parse(dataText) as BackupData;

    let meta: GitHubSyncMeta | undefined;
    if (metaRes.ok) {
      try {
        meta = JSON.parse(await metaRes.text()) as GitHubSyncMeta;
      } catch {}
    }

    return {
      success: true,
      data: backupData,
      meta,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: msg,
    };
  }
}

export async function uploadDataToGitHub(
  config: GitHubSyncConfig,
  data: BackupData,
): Promise<GitHubSyncResult> {
  const repo = normalizeRepo(config.repo);
  const branch = config.branch || "main";
  const deviceLabel = config.deviceLabel || "Kagelin Device";
  const deviceId = config.deviceId || "unknown-device";
  const now = new Date().toISOString();

  try {
    // 1. Get existing file SHAs if present
    const [existingDataSha, existingMetaSha] = await Promise.all([
      getRemoteFileSha(config, DATA_FILE_PATH),
      getRemoteFileSha(config, META_FILE_PATH),
    ]);

    // 2. Prepare payload
    const jsonString = JSON.stringify(data, null, 2);
    const base64Data = utf8ToBase64(jsonString);

    const commitMessage = `chore(sync): update data from ${deviceLabel} [${now.split("T")[0]}]`;

    // 3. Upload data file
    const uploadDataRes = await fetch(
      `https://api.github.com/repos/${repo}/contents/${DATA_FILE_PATH}`,
      {
        method: "PUT",
        headers: {
          ...getHeaders(config.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: commitMessage,
          content: base64Data,
          branch,
          ...(existingDataSha ? { sha: existingDataSha } : {}),
        }),
      },
    );

    if (!uploadDataRes.ok) {
      const errBody = await uploadDataRes.json().catch(() => ({}));
      return {
        success: false,
        error:
          uploadDataRes.status === 409
            ? "settings.github.error.conflict"
            : errBody.message ||
              `Upload data error: HTTP ${uploadDataRes.status}`,
      };
    }

    const uploadDataJson = await uploadDataRes.json();
    const commitSha = uploadDataJson.commit?.sha;
    const newDataFileSha = uploadDataJson.content?.sha;

    // 4. Upload sync-meta.json
    const meta: GitHubSyncMeta = {
      version: 1,
      deviceId,
      deviceLabel,
      updatedAt: now,
      dataSha: newDataFileSha,
      commitSha,
      appVersion: data.metadata?.appVersion || "1.0.0",
    };

    const base64Meta = utf8ToBase64(JSON.stringify(meta, null, 2));

    await fetch(
      `https://api.github.com/repos/${repo}/contents/${META_FILE_PATH}`,
      {
        method: "PUT",
        headers: {
          ...getHeaders(config.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `chore(sync): update meta from ${deviceLabel} [${now.split("T")[0]}]`,
          content: base64Meta,
          branch,
          ...(existingMetaSha ? { sha: existingMetaSha } : {}),
        }),
      },
    ).catch(() => {});

    return {
      success: true,
      meta,
      commitSha,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: msg,
    };
  }
}

export interface RemoteCommitCheckOptions {
  remoteMeta: GitHubSyncMeta | null;
  localDeviceId: string;
  lastRemoteCommitSha: string | null;
  lastSyncTime: string | null;
}

export function shouldPullRemoteCommit(opts: RemoteCommitCheckOptions): {
  shouldPull: boolean;
  reason?: "new-commit" | "timestamp-newer";
} {
  const { remoteMeta, localDeviceId, lastRemoteCommitSha, lastSyncTime } = opts;
  if (!remoteMeta || !remoteMeta.updatedAt) {
    return { shouldPull: false };
  }

  // Same device pushed this -> skip pulling own echo
  if (remoteMeta.deviceId && remoteMeta.deviceId === localDeviceId) {
    return { shouldPull: false };
  }

  // 1. When commit SHA is present on remote and we already recorded a last remote commit:
  if (remoteMeta.commitSha && lastRemoteCommitSha) {
    if (remoteMeta.commitSha !== lastRemoteCommitSha) {
      return { shouldPull: true, reason: "new-commit" };
    }
    // Commit SHA is identical -> exact same commit, skip
    return { shouldPull: false };
  }

  // 2. If commit SHA is present on remote but local has no recorded commit SHA:
  if (remoteMeta.commitSha && !lastRemoteCommitSha) {
    return { shouldPull: true, reason: "new-commit" };
  }

  // 3. Fallback to timestamp comparison if remote has no commit SHA
  if (
    !lastSyncTime ||
    new Date(remoteMeta.updatedAt) > new Date(lastSyncTime)
  ) {
    return { shouldPull: true, reason: "timestamp-newer" };
  }

  return { shouldPull: false };
}
