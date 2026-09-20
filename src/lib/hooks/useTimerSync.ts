"use client";

/**
 * Pure local standalone: timer state is managed in local client store.
 * Cloud multi-device real-time sync is not needed.
 */
export function useTimerSync() {
  return {
    upsertTimerState: async (_state?: unknown) => {},
    claimTimerCompletion: async (_endsAt?: unknown) => true,
    hydrate: async () => {},
  };
}
