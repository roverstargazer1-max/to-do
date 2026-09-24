import { get, set, del } from "idb-keyval";
import type { BackupData } from "@/lib/backup/types";

export const BASE_SNAPSHOT_STORAGE_KEY = "kagelin_sync_base_snapshot";
const FALLBACK_LOCAL_STORAGE_KEY = "kagelin_sync_base_snapshot_fallback";

export interface BaseSnapshotRecord {
  data: BackupData;
  commitSha?: string;
  savedAt: string;
}

// In-memory fallback if both IDB and localStorage are unavailable
let memorySnapshot: BaseSnapshotRecord | null = null;

function getLocalStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

/**
 * Saves a clean base snapshot of the current synchronized dataset along with its commit SHA.
 */
export async function saveBaseSnapshot(
  data: BackupData,
  commitSha?: string,
): Promise<void> {
  const record: BaseSnapshotRecord = {
    data,
    commitSha,
    savedAt: new Date().toISOString(),
  };

  memorySnapshot = record;

  try {
    await set(BASE_SNAPSHOT_STORAGE_KEY, record);
    return;
  } catch (idbErr) {
    const ls = getLocalStorage();
    if (ls) {
      try {
        ls.setItem(FALLBACK_LOCAL_STORAGE_KEY, JSON.stringify(record));
        return;
      } catch (lsErr) {
        throw new Error(
          `Failed to save base snapshot in IDB (${idbErr instanceof Error ? idbErr.message : String(idbErr)}) and localStorage (${lsErr instanceof Error ? lsErr.message : String(lsErr)})`,
        );
      }
    }
  }
}

/**
 * Retrieves the base snapshot record (including metadata and commitSha), or null if none exists.
 */
export async function getBaseSnapshotRecord(): Promise<BaseSnapshotRecord | null> {
  try {
    const record = await get<BaseSnapshotRecord>(BASE_SNAPSHOT_STORAGE_KEY);
    if (record && record.data) {
      memorySnapshot = record;
      return record;
    }
  } catch {
    // If IDB fails, fallback below
  }

  const ls = getLocalStorage();
  if (ls) {
    try {
      const raw = ls.getItem(FALLBACK_LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as BaseSnapshotRecord;
        if (parsed && parsed.data) {
          memorySnapshot = parsed;
          return parsed;
        }
      }
    } catch {
      // In-memory fallback if JSON parse fails
    }
  }

  return memorySnapshot;
}

/**
 * Retrieves the base snapshot data payload, or null if none exists.
 */
export async function getBaseSnapshot(): Promise<BackupData | null> {
  const record = await getBaseSnapshotRecord();
  return record?.data ?? null;
}

/**
 * Clears the base snapshot across IndexedDB, localStorage, and memory cache.
 */
export async function clearBaseSnapshot(): Promise<void> {
  memorySnapshot = null;
  try {
    await del(BASE_SNAPSHOT_STORAGE_KEY);
  } catch {
    // Continue clearing fallback
  }

  const ls = getLocalStorage();
  if (ls) {
    try {
      ls.removeItem(FALLBACK_LOCAL_STORAGE_KEY);
    } catch {
      // Ignore if localStorage unavailable
    }
  }
}
