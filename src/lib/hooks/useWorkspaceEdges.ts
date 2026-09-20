"use client";

import { useQuery } from "@tanstack/react-query";
import { workspaceMutations } from "@/lib/mutations/workspace";
import { workspaceKeys } from "@/lib/queries/workspace-keys";
import type { WorkspaceEdge } from "@/lib/types/workspace";

export function useWorkspaceEdges(workspaceId: string) {
  return useQuery({
    queryKey: workspaceKeys.edges.list(workspaceId, false),
    staleTime: 60000,
    queryFn: async (): Promise<WorkspaceEdge[]> =>
      workspaceMutations.listEdges(workspaceId),
  });
}
