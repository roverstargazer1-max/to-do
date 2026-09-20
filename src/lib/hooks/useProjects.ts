"use client";

import { useQuery } from "@tanstack/react-query";
import { projectsClient } from "@/lib/api/projects-client";
import type { Project } from "@/lib/types/task";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async (): Promise<Project[]> => {
      const all = await projectsClient.list();
      return all
        .filter((p) => !p.is_archived)
        .sort((a, b) => {
          if (a.is_inbox) return -1;
          if (b.is_inbox) return 1;
          return a.name.localeCompare(b.name);
        });
    },
  });
}

export function useProject(projectId: string | null) {
  return useQuery({
    queryKey: ["project", projectId],
    queryFn: async (): Promise<Project | null> => {
      if (!projectId) return null;
      const all = await projectsClient.list();
      return all.find((p) => p.id === projectId) ?? null;
    },
    enabled: !!projectId,
  });
}

export function useArchivedProjects() {
  return useQuery({
    queryKey: ["projects", "archived"],
    queryFn: async (): Promise<Project[]> => {
      const all = await projectsClient.list();
      return all
        .filter((p) => p.is_archived)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

export function useInboxProject() {
  const { data: projects, ...rest } = useProjects();
  return {
    ...rest,
    data: projects?.find((p) => p.is_inbox) ?? null,
  };
}
