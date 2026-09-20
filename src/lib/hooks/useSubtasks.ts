"use client";

import { useQuery } from "@tanstack/react-query";
import { tasksClient } from "@/lib/api/tasks-client";
import type { Task } from "@/lib/types/task";

/**
 * Fetches all subtasks for a given parent task.
 */
export function useSubtasks<TData = Task[]>(
  parentId: string | null | undefined,
  options?: { select?: (data: Task[]) => TData },
) {
  return useQuery({
    queryKey: ["subtasks", parentId],
    select: options?.select,
    queryFn: async (): Promise<Task[]> => {
      if (!parentId) return [];
      const tasks = await tasksClient.list({ showCompleted: true });
      return tasks
        .filter((t) => t.parent_id === parentId)
        .sort(
          (a, b) =>
            (a.day_order ?? 0) - (b.day_order ?? 0) ||
            a.created_at.localeCompare(b.created_at),
        );
    },
    enabled: !!parentId,
  });
}
