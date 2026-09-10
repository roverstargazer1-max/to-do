"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { workspaceMutations } from "@/lib/mutations/workspace";
import { workspaceKeys } from "@/lib/queries/workspace-keys";
import type { WorkspaceEdge } from "@/lib/types/workspace";

/**
 * Reads one workspace's connections (ADR 0021) — layout rows only. The
 * nodes they join are read through `useWorkspaceNodes`; an edge is drawn
 * only when both of its endpoints are in that set (derived at read, the
 * ADR 0019 discipline), so a stale row can never render a line to nothing.
 *
 * Same shape as the nodes family: the mode flag rides the key, so guest
 * and cloud entries never collide and invalidations stay scoped.
 */
export function useWorkspaceEdges(workspaceId: string) {
  const { isGuestMode } = useAuth();

  return useQuery({
    queryKey: workspaceKeys.edges.list(workspaceId, isGuestMode),
    staleTime: 60000,
    queryFn: async (): Promise<WorkspaceEdge[]> =>
      workspaceMutations.listEdges(workspaceId),
  });
}
