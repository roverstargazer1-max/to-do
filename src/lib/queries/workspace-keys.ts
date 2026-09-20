/**
 * Query-key factory for the Workspace domain (ADR 0016/0018): every
 * workspace query carries the mode flag in its key, mirroring the Task
 * factory's shape conventions.
 */

export const workspaceKeys = {
  /** Root prefix matching every workspaces-list entry (`["workspaces", …]`). */
  all: ["workspaces"] as const,

  /** The list entry `useWorkspaces` reads. */
  list: (isGuestMode?: boolean) => ["workspaces", { isGuestMode }] as const,

  nodes: {
    /** Root prefix matching every per-workspace node list. */
    all: ["workspace-nodes"] as const,
    /** Prefix matching the `["workspace-nodes", workspaceId, { isGuestMode }]` entry. */
    of: (workspaceId: string) => ["workspace-nodes", workspaceId] as const,
    /**
     * The list entry `useWorkspaceNodes` reads — mode flag rides the key so
     * guest and cloud entries never collide and invalidations stay scoped.
     */
    list: (workspaceId: string, isGuestMode?: boolean) =>
      ["workspace-nodes", workspaceId, { isGuestMode }] as const,
  },

  edges: {
    /** Root prefix matching every per-workspace edge list. */
    all: ["workspace-edges"] as const,
    /** Prefix matching the `["workspace-edges", workspaceId, { isGuestMode }]` entry. */
    of: (workspaceId: string) => ["workspace-edges", workspaceId] as const,
    /** The list entry `useWorkspaceEdges` reads (ADR 0021). */
    list: (workspaceId: string, isGuestMode?: boolean) =>
      ["workspace-edges", workspaceId, { isGuestMode }] as const,
  },
};
