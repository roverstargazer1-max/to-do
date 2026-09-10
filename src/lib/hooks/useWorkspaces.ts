"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { workspaceMutations } from "@/lib/mutations/workspace";
import { workspaceKeys } from "@/lib/queries/workspace-keys";
import type { Workspace } from "@/lib/types/workspace";

/**
 * Reads the signed-in mode's workspace list. The mode flag rides the key
 * (the task-query convention) so guest and cloud entries never collide
 * and invalidations stay scoped.
 */
export function useWorkspaces() {
  const { isGuestMode } = useAuth();

  return useQuery({
    queryKey: workspaceKeys.list(isGuestMode),
    staleTime: 60000,
    queryFn: async (): Promise<Workspace[]> => workspaceMutations.list(),
  });
}
