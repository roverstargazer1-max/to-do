"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { workspaceMutations } from "@/lib/mutations/workspace";
import { workspaceKeys } from "@/lib/queries/workspace-keys";
import type { WorkspaceNode } from "@/lib/types/workspace";

/**
 * Reads one workspace's node rows — reference metadata only; the entities
 * they point at are read through their own query families. The mode flag
 * rides the key (the task-query convention) so guest and cloud entries
 * never collide and invalidations stay scoped.
 */
export function useWorkspaceNodes(workspaceId: string) {
  const { isGuestMode } = useAuth();

  return useQuery({
    queryKey: workspaceKeys.nodes.list(workspaceId, isGuestMode),
    staleTime: 60000,
    queryFn: async (): Promise<WorkspaceNode[]> =>
      workspaceMutations.listNodes(workspaceId),
  });
}
