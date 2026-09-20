"use client";

import { useQuery } from "@tanstack/react-query";
import { tasksClient } from "@/lib/api/tasks-client";
import type { Task } from "@/lib/types/task";

export function useActiveTask(taskId: string | null): {
  data: Task | null;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: ["task", taskId],
    queryFn: async (): Promise<Task | null> => {
      if (!taskId) return null;
      const tasks = await tasksClient.list({ showCompleted: true });
      return tasks.find((t) => t.id === taskId) ?? null;
    },
    enabled: !!taskId,
  });

  return {
    data: data ?? null,
    isLoading,
  };
}
