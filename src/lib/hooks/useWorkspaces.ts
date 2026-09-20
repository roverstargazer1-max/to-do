"use client";

import { useQuery } from "@tanstack/react-query";
import { workspaceMutations } from "@/lib/mutations/workspace";
import { workspaceKeys } from "@/lib/queries/workspace-keys";
import type { Workspace } from "@/lib/types/workspace";

export function useWorkspaces() {
  return useQuery({
    queryKey: workspaceKeys.list(false),
    staleTime: 60000,
    queryFn: async (): Promise<Workspace[]> => workspaceMutations.list(),
  });
}
