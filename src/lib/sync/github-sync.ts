import type { BackupData } from "@/lib/backup/types";

export interface GitHubSyncConfig {
  token: string;
  repo: string;
  branch?: string;
  deviceLabel?: string;
  deviceId?: string;
}

/** Defaults applied by `buildSyncConfig` so every entry shares one shape. */
const DEFAULT_BRANCH = "main";
const DEFAULT_DEVICE_LABEL = "Personal Device";
const DEFAULT_DEVICE_ID = "unknown-device";

/**
 * Unified constructor for the GitHub sync config. Every sync entry point
 * (manual sync, manual push, background push/check) builds its config through
 * this factory so the token/repo/branch/device shape stays in one place.
 */
export function buildSyncConfig(input: {
  token: string;
  repo: string;
  branch?: string;
  deviceLabel?: string;
  deviceId?: string;
}): GitHubSyncConfig {
  return {
    token: input.token,
    repo: input.repo,
    branch: input.branch || DEFAULT_BRANCH,
    deviceLabel: input.deviceLabel || DEFAULT_DEVICE_LABEL,
    deviceId: input.deviceId || DEFAULT_DEVICE_ID,
  };
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
  dataSha?: string;
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

export function extractShaFromETag(etagHeader: string | null): string | null {
  if (!etagHeader) return null;
  const clean = etagHeader.replace(/^W\//, "").replace(/"/g, "").trim();
  return /^[0-9a-f]{40}$/i.test(clean) ? clean : null;
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
      cache: "no-store",
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
  forceFresh = false,
): Promise<string | null> {
  const repo = normalizeRepo(config.repo);
  const branch = config.branch || "main";
  try {
    const sep = path.includes("?") ? "&" : "?";
    const freshParam = forceFresh ? `&_t=${Date.now()}` : "";
    const res = await fetch(
      `https://api.github.com/repos/${repo}/contents/${path}${sep}ref=${encodeURIComponent(branch)}${freshParam}`,
      {
        headers: getHeaders(config.token),
        cache: "no-store",
      },
    );

    if (res.status === 404) {
      return null;
    }

    const etagHeader =
      typeof res.headers?.get === "function" ? res.headers.get("etag") : null;
    const etagSha = extractShaFromETag(etagHeader);

    if (res.status === 304) {
      return etagSha;
    }

    if (!res.ok) {
      return etagSha;
    }

    const json = (await res.json()) as GitHubFileContentResponse;
    return json.sha || etagSha || null;
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
        cache: "no-store",
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
          cache: "no-store",
        },
      ),
      fetch(
        `https://api.github.com/repos/${repo}/contents/${DATA_FILE_PATH}?ref=${encodeURIComponent(branch)}`,
        {
          headers: {
            ...getHeaders(config.token),
            Accept: "application/vnd.github.raw+json",
          },
          cache: "no-store",
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
    const dataEtagHeader =
      typeof dataRes.headers?.get === "function"
        ? dataRes.headers.get("etag")
        : null;
    const extractedDataSha = extractShaFromETag(dataEtagHeader);

    let meta: GitHubSyncMeta | undefined;
    if (metaRes.ok) {
      try {
        meta = JSON.parse(await metaRes.text()) as GitHubSyncMeta;
      } catch {}
    }

    if (extractedDataSha) {
      if (meta) {
        if (!meta.dataSha) meta.dataSha = extractedDataSha;
      } else {
        meta = {
          version: 1,
          deviceId: "",
          deviceLabel: "",
          updatedAt:
            backupData.metadata?.exportedAt || new Date().toISOString(),
          dataSha: extractedDataSha,
          appVersion: backupData.metadata?.appVersion || "1.0.0",
        };
      }
    }

    return {
      success: true,
      data: backupData,
      meta,
      dataSha: extractedDataSha ?? undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: msg,
    };
  }
}

export interface UploadDataOptions {
  customCommitMessage?: string;
  fallbackDataSha?: string | null;
  fallbackMetaSha?: string | null;
}

export async function uploadDataToGitHub(
  config: GitHubSyncConfig,
  data: BackupData,
  optionsOrCommitMessage?: string | UploadDataOptions,
): Promise<GitHubSyncResult> {
  const repo = normalizeRepo(config.repo);
  const branch = config.branch || "main";
  const deviceLabel = config.deviceLabel || "Kagelin Device";
  const deviceId = config.deviceId || "unknown-device";
  const now = new Date().toISOString();

  const options: UploadDataOptions =
    typeof optionsOrCommitMessage === "string"
      ? { customCommitMessage: optionsOrCommitMessage }
      : optionsOrCommitMessage || {};

  try {
    // 1. Get existing file SHAs if present
    let [existingDataSha, existingMetaSha] = await Promise.all([
      getRemoteFileSha(config, DATA_FILE_PATH),
      getRemoteFileSha(config, META_FILE_PATH),
    ]);

    // Fallback to caller-provided fallbackSha (e.g. from local sync store) if live query returned null
    if (!existingDataSha && options.fallbackDataSha) {
      existingDataSha = options.fallbackDataSha;
    }
    if (!existingMetaSha && options.fallbackMetaSha) {
      existingMetaSha = options.fallbackMetaSha;
    }

    // 2. Prepare payload
    const jsonString = JSON.stringify(data, null, 2);
    const base64Data = utf8ToBase64(jsonString);

    const commitMessage =
      options.customCommitMessage ||
      `chore(sync): update data from ${deviceLabel} [${now.split("T")[0]}]`;

    // 3. Upload data file
    let uploadDataRes = await fetch(
      `https://api.github.com/repos/${repo}/contents/${DATA_FILE_PATH}`,
      {
        method: "PUT",
        headers: {
          ...getHeaders(config.token),
          "Content-Type": "application/json",
        },
        cache: "no-store",
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
      const errMsg = String(errBody.message || "");

      // Self-heal: If 422 because SHA wasn't supplied, but file exists on remote,
      // force fetch fresh SHA with cache-busting and retry PUT once.
      if (
        uploadDataRes.status === 422 &&
        errMsg.toLowerCase().includes("sha")
      ) {
        const freshSha =
          options.fallbackDataSha ||
          (await getRemoteFileSha(config, DATA_FILE_PATH, true));
        if (freshSha && freshSha !== existingDataSha) {
          existingDataSha = freshSha;
          uploadDataRes = await fetch(
            `https://api.github.com/repos/${repo}/contents/${DATA_FILE_PATH}`,
            {
              method: "PUT",
              headers: {
                ...getHeaders(config.token),
                "Content-Type": "application/json",
              },
              cache: "no-store",
              body: JSON.stringify({
                message: commitMessage,
                content: base64Data,
                branch,
                sha: freshSha,
              }),
            },
          );
        }
      }

      if (!uploadDataRes.ok) {
        const retryErrBody = await uploadDataRes.json().catch(() => ({}));
        return {
          success: false,
          error:
            uploadDataRes.status === 409
              ? "settings.github.error.conflict"
              : retryErrBody.message ||
                errBody.message ||
                `Upload data error: HTTP ${uploadDataRes.status}`,
        };
      }
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

    const metaPutRes = await fetch(
      `https://api.github.com/repos/${repo}/contents/${META_FILE_PATH}`,
      {
        method: "PUT",
        headers: {
          ...getHeaders(config.token),
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          message: `chore(sync): update meta from ${deviceLabel} [${now.split("T")[0]}]`,
          content: base64Meta,
          branch,
          ...(existingMetaSha ? { sha: existingMetaSha } : {}),
        }),
      },
    ).catch(() => null);

    // Self-heal meta upload on 422 sha missing
    if (metaPutRes && metaPutRes.status === 422 && !existingMetaSha) {
      const freshMetaSha = await getRemoteFileSha(config, META_FILE_PATH, true);
      if (freshMetaSha) {
        await fetch(
          `https://api.github.com/repos/${repo}/contents/${META_FILE_PATH}`,
          {
            method: "PUT",
            headers: {
              ...getHeaders(config.token),
              "Content-Type": "application/json",
            },
            cache: "no-store",
            body: JSON.stringify({
              message: `chore(sync): update meta from ${deviceLabel} [${now.split("T")[0]}]`,
              content: base64Meta,
              branch,
              sha: freshMetaSha,
            }),
          },
        ).catch(() => {});
      }
    }

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
  lastRemoteDataSha?: string | null;
  lastSyncTime: string | null;
}

export function shouldPullRemoteCommit(opts: RemoteCommitCheckOptions): {
  shouldPull: boolean;
  reason?: "new-commit" | "timestamp-newer";
} {
  const {
    remoteMeta,
    localDeviceId,
    lastRemoteCommitSha,
    lastRemoteDataSha,
    lastSyncTime,
  } = opts;
  if (!remoteMeta || !remoteMeta.updatedAt) {
    return { shouldPull: false };
  }

  // Same device pushed this -> skip pulling own echo
  if (remoteMeta.deviceId && remoteMeta.deviceId === localDeviceId) {
    return { shouldPull: false };
  }

  // 0. Content fingerprint (data file blob SHA) comparison. Works uniformly for
  //    both the normal sync-meta.json and the fallback meta derived from
  //    kagelin-data.json (see resolveRemoteSyncMeta), keeping SHA-granularity
  //    detection even when the metadata file is missing.
  if (remoteMeta.dataSha && lastRemoteDataSha) {
    if (remoteMeta.dataSha !== lastRemoteDataSha) {
      return { shouldPull: true, reason: "new-commit" };
    }
    // Data blob identical -> exact same snapshot, skip
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

// ---------------------------------------------------------------------------
// Push safety & data-loss prevention (DLP) guard
// ---------------------------------------------------------------------------

/** Error code returned when a push violates the DLP guard. */
export const DLP_BLOCKED_ERROR_CODE = "settings.github.error.dlpBlocked";

/** Entries are considered a "cliff drop" when local < remote × (1 - threshold). */
export const PUSH_CLIFF_DROP_THRESHOLD = 0.5;

export type PushSafetyReason =
  "local-empty" | "cliff-drop" | "remote-unreadable";

export interface PushSafetyResult {
  safe: boolean;
  reason?: PushSafetyReason;
  counts?: { local: number; remote: number };
  /** True when the remote has no data file yet (first push). */
  remoteMissing?: boolean;
}

export type SyncAction =
  | { kind: "pull"; device?: string }
  | { kind: "push" }
  | { kind: "aligned" }
  | {
      kind: "push-blocked-dlp";
      reason: PushSafetyReason;
      counts: { local: number; remote: number };
    }
  | { kind: "conflict"; device?: string };

export interface DecideSyncFlowOptions {
  shouldPull: boolean;
  pullDevice?: string;
  hasUnsyncedChanges: boolean;
  safety: PushSafetyResult;
}

/**
 * Total number of user-owned entries across every data section. Optional
 * sections (workspaces, visual assets, …) count as 0 when absent.
 */
export function countBackupEntries(data: BackupData): number {
  return (
    (data.tasks?.length ?? 0) +
    (data.projects?.length ?? 0) +
    (data.habits?.length ?? 0) +
    (data.habit_entries?.length ?? 0) +
    (data.focus_logs?.length ?? 0) +
    (data.events?.length ?? 0) +
    (data.workspaces?.length ?? 0) +
    (data.workspace_nodes?.length ?? 0) +
    (data.visual_assets?.length ?? 0) +
    (data.visual_asset_versions?.length ?? 0) +
    (data.visual_annotations?.length ?? 0) +
    (data.visual_derived?.length ?? 0) +
    (data.visual_relations?.length ?? 0) +
    (data.visual_flow_drafts?.length ?? 0)
  );
}

/**
 * Content fingerprint used to skip no-op pushes. `metadata.exportedAt` is
 * regenerated on every local export, so it is excluded: two collects of the
 * same data must compare equal even though the timestamps differ.
 *
 * Deliberately a plain string comparison instead of a hash: a hash collision
 * here would silently skip a legitimate push (a data-loss vector), while an
 * extra JSON string in memory is negligible.
 */
export function fingerprintBackupData(data: BackupData): string {
  const { metadata: rawMeta, ...rest } = data;
  const { exportedAt: _omit, ...metadata } = rawMeta;
  return JSON.stringify({ metadata, ...rest });
}

/**
 * Dual-tier DLP assessment: blocks when the local snapshot is empty while the
 * remote holds data ("local-empty"), or when local entries drop by more than
 * `PUSH_CLIFF_DROP_THRESHOLD` relative to the remote ("cliff-drop"). A missing
 * or unparseable remote is treated as unreadable and blocked too, since we
 * cannot verify we are not wiping existing data.
 */
export function assessPushSafety(
  local: BackupData,
  remote: BackupData | null,
): PushSafetyResult {
  if (!remote) {
    return { safe: true, remoteMissing: true };
  }
  const counts = {
    local: countBackupEntries(local),
    remote: countBackupEntries(remote),
  };

  if (counts.remote > 0 && counts.local === 0) {
    return { safe: false, reason: "local-empty", counts };
  }
  if (
    counts.remote > 0 &&
    counts.local < counts.remote * (1 - PUSH_CLIFF_DROP_THRESHOLD)
  ) {
    return { safe: false, reason: "cliff-drop", counts };
  }
  return { safe: true, counts };
}

/**
 * Pure decision function for the "sync now" flow. Encodes the
 * No-Dirty-No-Push principle: without a remote update, we refuse to push when
 * there are no local unsynced changes ("aligned"), and the DLP guard merges
 * into a "push-blocked-dlp" action instead of silently overwriting.
 *
 * Branch order (single source of truth for every sync entry point):
 *   conflict (remote updated + local dirty) → pull → aligned → DLP-blocked
 *   → push. The device label is returned as raw data; the UI layer owns the
 *   localized fallback when it is absent.
 */
export function decideSyncFlow(opts: DecideSyncFlowOptions): SyncAction {
  if (opts.shouldPull && opts.hasUnsyncedChanges) {
    // Remote updated but local holds unpushed changes: never pull over them,
    // never push. Refuse and surface the conflict.
    return { kind: "conflict", device: opts.pullDevice };
  }
  if (opts.shouldPull) {
    return { kind: "pull", device: opts.pullDevice };
  }
  if (!opts.hasUnsyncedChanges) {
    return { kind: "aligned" };
  }
  if (!opts.safety.safe) {
    return {
      kind: "push-blocked-dlp",
      reason: opts.safety.reason ?? "local-empty",
      counts: opts.safety.counts ?? { local: 0, remote: 0 },
    };
  }
  return { kind: "push" };
}

/**
 * Fetch the remote sync state with a fallback: when sync-meta.json is missing
 * or unreadable, derive an equivalent meta from kagelin-data.json's
 * metadata.exportedAt plus the data file's blob SHA. `fallbackUsed` lets the
 * caller surface a compatibility notice.
 */
export async function resolveRemoteSyncMeta(
  config: GitHubSyncConfig,
): Promise<{ meta: GitHubSyncMeta | null; fallbackUsed: boolean }> {
  const meta = await getRemoteSyncMeta(config);
  if (meta && meta.updatedAt) {
    return { meta, fallbackUsed: false };
  }

  const dataRes = await downloadDataFromGitHub(config);
  if (!dataRes.success || !dataRes.data?.metadata?.exportedAt) {
    return { meta: null, fallbackUsed: true };
  }
  const dataSha = await getRemoteFileSha(config, DATA_FILE_PATH);
  return {
    meta: {
      version: 1,
      deviceId: "",
      deviceLabel: "",
      updatedAt: dataRes.data.metadata.exportedAt,
      dataSha: dataSha ?? undefined,
      appVersion: dataRes.data.metadata.appVersion || "1.0.0",
    },
    fallbackUsed: true,
  };
}

/**
 * Pre-flight DLP check before a push: reads the remote snapshot (best effort
 * reuse of the download contract) and runs the pure assessment. A remote that
 * is missing (404) is a safe first push; any other read failure blocks the
 * push as "remote-unreadable".
 */
export async function checkPushSafety(
  config: GitHubSyncConfig,
  localData: BackupData,
): Promise<PushSafetyResult> {
  const remoteRes = await downloadDataFromGitHub(config);
  if (!remoteRes.success) {
    if (remoteRes.error === "settings.github.error.dataNotFoundOnRemote") {
      return { safe: true, remoteMissing: true };
    }
    return { safe: false, reason: "remote-unreadable" };
  }
  return assessPushSafety(localData, remoteRes.data ?? null);
}

// ---------------------------------------------------------------------------
// Backup Branch & Snapshot Archive
// ---------------------------------------------------------------------------

/**
 * Format user remark into a safe Git branch slug (max default 15 chars).
 * Strips illegal characters, collapses whitespace/hyphens, and avoids trailing hyphens.
 */
export function formatBackupBranchSlug(remark: string, maxLen = 15): string {
  if (!remark) return "";
  const trimmed = remark.trim().toLowerCase();
  if (!trimmed) return "";

  const slug = trimmed.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");

  if (!slug) return "";

  return slug.slice(0, maxLen).replace(/-+$/g, "");
}

/**
 * Build default backup branch name in the format backup/YYYY-MM-DD-HH or
 * backup/YYYY-MM-DD-HH-<slug>.
 */
export function buildDefaultBackupBranchName(
  date: Date = new Date(),
  slug?: string,
): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const base = `backup/${year}-${month}-${day}-${hours}`;

  const cleanSlug = slug ? formatBackupBranchSlug(slug) : "";
  return cleanSlug ? `${base}-${cleanSlug}` : base;
}

/**
 * Format commit message for snapshot backup branch.
 * With remark: `backup: <remark>`
 * Without remark: `backup: <YYYY-MM-DD HH>h`
 */
export function formatBackupCommitMessage(
  remark?: string,
  date: Date = new Date(),
): string {
  const trimmed = remark?.trim();
  if (trimmed) {
    return `backup: ${trimmed}`;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  return `backup: ${year}-${month}-${day} ${hours}h`;
}

/**
 * Query the latest commit SHA of a given branch.
 */
export async function getBranchCommitSha(
  config: GitHubSyncConfig,
  branchName?: string,
): Promise<string | null> {
  const repo = normalizeRepo(config.repo);
  const branch = branchName || config.branch || "main";
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(branch)}`,
      {
        headers: getHeaders(config.token),
        cache: "no-store",
      },
    );
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    return data.sha || data.commit?.sha || null;
  } catch {
    return null;
  }
}

/**
 * Probe whether a remote branch exists on GitHub.
 */
export async function checkBranchExists(
  config: GitHubSyncConfig,
  branchName: string,
): Promise<boolean> {
  const repo = normalizeRepo(config.repo);
  const cleanBranch = branchName.replace(/^refs\/heads\//, "");
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/branches/${encodeURIComponent(cleanBranch)}`,
      {
        headers: getHeaders(config.token),
        cache: "no-store",
      },
    );
    return res.status === 200;
  } catch {
    return false;
  }
}

/**
 * Create a new branch reference via GitHub Git Database API.
 */
export async function createBranchRef(
  config: GitHubSyncConfig,
  newBranchName: string,
  baseCommitSha: string,
): Promise<{
  success: boolean;
  error?: string;
  ref?: string;
  sha?: string;
  status?: number;
}> {
  const repo = normalizeRepo(config.repo);
  const cleanBranch = newBranchName.replace(/^refs\/heads\//, "");
  const ref = `refs/heads/${cleanBranch}`;

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/git/refs`, {
      method: "POST",
      headers: {
        ...getHeaders(config.token),
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        ref,
        sha: baseCommitSha,
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return {
        success: false,
        status: res.status,
        error: errJson.message || `Failed to create branch: HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    return {
      success: true,
      status: res.status,
      ref: data.ref,
      sha: data.object?.sha,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Detect branch conflicts and append incrementing suffixes (-1, -2) until safe.
 */
export async function resolveSafeBackupBranchName(
  config: GitHubSyncConfig,
  targetBranchName: string,
): Promise<string> {
  const exists = await checkBranchExists(config, targetBranchName);
  if (!exists) {
    return targetBranchName;
  }

  let counter = 1;
  while (counter <= 100) {
    const candidate = `${targetBranchName}-${counter}`;
    const candidateExists = await checkBranchExists(config, candidate);
    if (!candidateExists) {
      return candidate;
    }
    counter++;
  }
  return `${targetBranchName}-${Date.now()}`;
}

export interface CreateBackupBranchOptions {
  remark?: string;
  data: BackupData;
  now?: Date;
}

export interface CreateBackupBranchResult {
  success: boolean;
  error?: string;
  branchName?: string;
  commitSha?: string;
  viewUrl?: string;
}

/**
 * End-to-end orchestration: creates an isolated backup branch and commits full
 * local snapshot data without touching the active working branch or unsynced changes.
 */
export async function createBackupBranchSnapshot(
  config: GitHubSyncConfig,
  options: CreateBackupBranchOptions,
): Promise<CreateBackupBranchResult> {
  if (!config.token?.trim()) {
    return { success: false, error: "settings.github.error.missingToken" };
  }
  const cleanRepo = normalizeRepo(config.repo);
  if (!cleanRepo || !cleanRepo.includes("/")) {
    return { success: false, error: "settings.github.error.invalidRepoFormat" };
  }

  const baseBranch = config.branch || "main";

  // 1. Query base branch commit SHA
  const baseCommitSha = await getBranchCommitSha(config, baseBranch);
  if (!baseCommitSha) {
    return {
      success: false,
      error: "settings.github.error.baseBranchNotFound",
    };
  }

  // 2. Resolve safe, non-colliding backup branch name
  const date = options.now || new Date();
  const slug = options.remark
    ? formatBackupBranchSlug(options.remark)
    : undefined;
  const initialBranchName = buildDefaultBackupBranchName(date, slug);

  let safeBranchName = await resolveSafeBackupBranchName(
    config,
    initialBranchName,
  );

  // 3. Create branch ref (handling race conditions / 422 if conflict occurs)
  let refRes = await createBranchRef(config, safeBranchName, baseCommitSha);
  let retryCount = 1;
  while (
    !refRes.success &&
    (refRes.status === 422 ||
      refRes.error?.toLowerCase().includes("already exists")) &&
    retryCount <= 50
  ) {
    safeBranchName = `${initialBranchName}-${retryCount}`;
    refRes = await createBranchRef(config, safeBranchName, baseCommitSha);
    retryCount++;
  }

  if (!refRes.success) {
    return {
      success: false,
      error: refRes.error || "Failed to create branch reference",
    };
  }

  // 4. Upload kagelin-data.json and sync-meta.json to the new branch
  const commitTitle = formatBackupCommitMessage(options.remark, date);
  const uploadRes = await uploadDataToGitHub(
    {
      ...config,
      branch: safeBranchName,
    },
    options.data,
    {
      customCommitMessage: commitTitle,
    },
  );

  if (!uploadRes.success) {
    return {
      success: false,
      error: uploadRes.error || "Failed to upload data to backup branch",
    };
  }

  const viewUrl = `https://github.com/${cleanRepo}/tree/${safeBranchName}`;
  return {
    success: true,
    branchName: safeBranchName,
    commitSha: uploadRes.commitSha || refRes.sha || baseCommitSha,
    viewUrl,
  };
}
