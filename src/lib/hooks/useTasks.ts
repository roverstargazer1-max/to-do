"use client";

import { useQuery } from "@tanstack/react-query";
import { tasksClient } from "@/lib/api/tasks-client";
import type { Task } from "@/lib/types/task";

interface UseTasksOptions<TData = Task[]> {
  projectId?: string | null;
  showCompleted?: boolean;
  filter?: string;
  select?: (data: Task[]) => TData;
}

export function useTasks<TData = Task[]>(options: UseTasksOptions<TData> = {}) {
  const { projectId, showCompleted = false, filter, select } = options;

  return useQuery({
    queryKey: ["tasks", { projectId, showCompleted, filter }],
    staleTime: 60000,
    select,
    queryFn: async (): Promise<Task[]> => {
      return tasksClient.list({
        projectId,
        showCompleted,
        filter,
      });
    },
  });
}

export function useTaskSeries(seriesId?: string | null) {
  return useQuery({
    queryKey: ["tasks", "series", seriesId],
    enabled: !!seriesId,
    queryFn: async (): Promise<Task[]> => {
      if (!seriesId) return [];
      const tasks = await tasksClient.list({ showCompleted: true });
      return tasks.filter((t) => t.recurring_series_id === seriesId);
    },
  });
}

export function useTask(taskId?: string | null) {
  return useQuery({
    queryKey: ["task", taskId],
    enabled: !!taskId,
    queryFn: async (): Promise<Task | null> => {
      if (!taskId) return null;
      const tasks = await tasksClient.list({ showCompleted: true });
      return tasks.find((t) => t.id === taskId) ?? null;
    },
  });
}

export { useInboxProject } from "./useProjects";
