"use client";

import { useQueryClient } from "@tanstack/react-query";
import { notify } from "@/lib/notify";

const QUERY_KEYS = [
  "tasks",
  "projects",
  "habits",
  "stats-dashboard",
  "calendar-events",
  "calendar-tasks",
  "demo-mode",
  "workspaces",
  "workspace-nodes",
  "workspace-edges",
];

function useStoreAction(action: () => void | Promise<void>, message: string) {
  const queryClient = useQueryClient();

  return async () => {
    await action();
    queryClient.removeQueries({
      predicate: (query) => QUERY_KEYS.includes(query.queryKey[0] as string),
    });
    notify.success(message);
  };
}

/** Clears every row in the local SQLite database and the local asset files. */
export function useClearGuestData() {
  return useStoreAction(async () => {
    const res = await fetch("/api/db/wipe", { method: "POST" });
    if (!res.ok)
      throw new Error(`Failed to clear local data: ${res.statusText}`);
  }, "All data cleared");
}

export function useResetDemoData() {
  return useStoreAction(() => {}, "Demo data reset successfully");
}
