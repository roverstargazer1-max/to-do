"use client";

import { useQuery } from "@tanstack/react-query";
import { workspaceMutations } from "@/lib/mutations/workspace";
import { workspaceKeys } from "@/lib/queries/workspace-keys";
import type { WorkspaceNode } from "@/lib/types/workspace";

export function useWorkspaceNodes(workspaceId: string) {
  return useQuery({
    queryKey: workspaceKeys.nodes.list(workspaceId, false),
    staleTime: 60000,
    queryFn: async (): Promise<WorkspaceNode[]> =>
      workspaceMutations.listNodes(workspaceId),
  });
}
