"use client";

import { useQueryClient } from "@tanstack/react-query";
import { mockStore } from "@/lib/mock/mock-store";
import { guestWorkspaceStore } from "@/lib/workspace/guest-store";
import { notify } from "@/lib/notify";

// Shared so Clear Data, Start fresh and Reset Demo can't drift on which
// caches they clear. Workspace prefixes ride along (ticket 09): a cleared
// guest store takes its canvas caches with it.
const GUEST_QUERY_KEYS = [
  "tasks",
  "projects",
  "habits",
  "stats-dashboard",
  "calendar-events",
  "calendar-tasks",
  "demo-mode",
  "workspaces",
  "workspace-nodes",
];

function useGuestStoreAction(
  action: () => void | Promise<void>,
  message: string,
) {
  const queryClient = useQueryClient();

  return async () => {
    await action();
    queryClient.removeQueries({
      predicate: (query) =>
        GUEST_QUERY_KEYS.includes(query.queryKey[0] as string),
    });
    notify.success(message);
  };
}

export function useClearGuestData() {
  // "Start fresh" empties the whole guest store, canvas included (ticket 09):
  // a partial clear would leave nodes referencing nothing. The IndexedDB
  // workspace key is dropped alongside mockStore's localStorage blob.
  return useGuestStoreAction(async () => {
    mockStore.clearData();
    await guestWorkspaceStore.clearAll();
  }, "All data cleared");
}

// Settings' "Reset Demo" — repopulates seed data, so Demo mode goes back on.
// Workspaces are never demo content (no demo workspace, ADR 0018), so they
// are untouched here.
export function useResetDemoData() {
  return useGuestStoreAction(
    () => mockStore.reset(),
    "Demo data reset successfully",
  );
}
