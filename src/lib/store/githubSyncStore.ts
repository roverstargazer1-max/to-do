"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getDeviceId } from "./deviceId";
import type { GitHubSyncMeta } from "@/lib/sync/github-sync";
import { clearBaseSnapshot } from "@/lib/sync/base-snapshot";
import type { BackupData } from "@/lib/backup/types";
import type { MergeResult } from "@/lib/sync/merge-engine";

export type SyncStatus =
  "idle" | "testing" | "syncing" | "success" | "error" | "conflict";

export interface PendingConflictContext {
  deviceLabel: string;
  mergeResult: MergeResult;
  localData: BackupData;
  remoteData: BackupData;
  remoteMeta: GitHubSyncMeta | null;
}

export interface GitHubSyncState {
  // Credentials & Repository
  token: string;
  repo: string;
  branch: string;
  deviceLabel: string;

  // Automation flags
  autoSyncOnStart: boolean;
  autoSyncOnExit: boolean;
  autoSyncDebounced: boolean;

  // Runtime synchronization state
  status: SyncStatus;
  lastSyncTime: string | null;
  lastRemoteCommitSha: string | null;
  lastRemoteDataSha: string | null;
  lastRemoteCommitMessage: string | null;
  lastSyncDevice: string | null;
  lastError: string | null;
  hasUnsyncedChanges: boolean;
  pendingConflict: PendingConflictContext | null;

  // Actions
  setConfig: (
    partial: Partial<{
      token: string;
      repo: string;
      branch: string;
      deviceLabel: string;
      autoSyncOnStart: boolean;
      autoSyncOnExit: boolean;
      autoSyncDebounced: boolean;
    }>,
  ) => void;
  clearConfig: () => void;
  setStatus: (status: SyncStatus, error?: string | null) => void;
  setHasUnsyncedChanges: (hasChanges: boolean) => void;
  setPendingConflict: (conflict: PendingConflictContext | null) => void;
  clearPendingConflict: () => void;
  recordSyncSuccess: (meta?: GitHubSyncMeta, commitMessage?: string) => void;
  getEffectiveDeviceId: () => string;
}

function getDefaultDeviceLabel(): string {
  if (typeof window === "undefined") return "Desktop";
  const electronPlatform = window.electron?.platform;
  const platform =
    electronPlatform ||
    (navigator as { userAgentData?: { platform?: string } }).userAgentData
      ?.platform ||
    navigator.platform ||
    "";
  const lower = String(platform).toLowerCase();
  if (lower.includes("mac") || lower.includes("darwin")) return "MacBook";
  if (lower.includes("win")) return "Windows PC";
  if (lower.includes("linux")) return "Linux";
  return "Personal Device";
}

export const useGitHubSyncStore = create<GitHubSyncState>()(
  persist(
    (set) => ({
      token: "",
      repo: "",
      branch: "main",
      deviceLabel: getDefaultDeviceLabel(),

      autoSyncOnStart: true,
      autoSyncOnExit: true,
      autoSyncDebounced: true,

      status: "idle",
      lastSyncTime: null,
      lastRemoteCommitSha: null,
      lastRemoteDataSha: null,
      lastRemoteCommitMessage: null,
      lastSyncDevice: null,
      lastError: null,
      hasUnsyncedChanges: false,
      pendingConflict: null,

      setConfig: (partial) =>
        set((state) => ({
          ...state,
          ...partial,
        })),

      clearConfig: () => {
        void clearBaseSnapshot();
        set({
          token: "",
          repo: "",
          branch: "main",
          status: "idle",
          lastSyncTime: null,
          lastRemoteCommitSha: null,
          lastRemoteDataSha: null,
          lastRemoteCommitMessage: null,
          lastSyncDevice: null,
          lastError: null,
          hasUnsyncedChanges: false,
          pendingConflict: null,
        });
      },

      setStatus: (status, error = null) =>
        set({
          status,
          lastError: error,
        }),

      setHasUnsyncedChanges: (hasChanges) =>
        set({
          hasUnsyncedChanges: hasChanges,
        }),

      setPendingConflict: (conflict) =>
        set({
          pendingConflict: conflict,
        }),

      clearPendingConflict: () =>
        set({
          pendingConflict: null,
        }),

      recordSyncSuccess: (meta, commitMessage) =>
        set((state) => ({
          status: "success",
          lastError: null,
          hasUnsyncedChanges: false,
          pendingConflict: null,
          lastSyncTime: meta?.updatedAt || new Date().toISOString(),
          lastRemoteCommitSha: meta?.commitSha || state.lastRemoteCommitSha,
          lastRemoteDataSha: meta?.dataSha || state.lastRemoteDataSha,
          lastRemoteCommitMessage:
            commitMessage || state.lastRemoteCommitMessage,
          lastSyncDevice: meta?.deviceLabel || state.deviceLabel,
        })),

      getEffectiveDeviceId: () => getDeviceId(),
    }),
    {
      name: "kanso-github-sync-config",
      partialize: (state) => ({
        token: state.token,
        repo: state.repo,
        branch: state.branch,
        deviceLabel: state.deviceLabel,
        autoSyncOnStart: state.autoSyncOnStart,
        autoSyncOnExit: state.autoSyncOnExit,
        autoSyncDebounced: state.autoSyncDebounced,
        hasUnsyncedChanges: state.hasUnsyncedChanges,
        lastSyncTime: state.lastSyncTime,
        lastRemoteCommitSha: state.lastRemoteCommitSha,
        lastRemoteDataSha: state.lastRemoteDataSha,
        lastRemoteCommitMessage: state.lastRemoteCommitMessage,
        lastSyncDevice: state.lastSyncDevice,
      }),
    },
  ),
);
