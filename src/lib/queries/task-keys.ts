/**
 * Query-key factory for the Task domain (ADR 0016/0017): existing task key
 * shapes wrapped byte-for-byte, so the commands' cache policy lands on the
 * exact entries the query hooks read. Full-repo centralisation of every
 * other key family is a slow follow-up, not this factory's job.
 */

export interface TaskListFilters {
  projectId?: string | null;
  showCompleted?: boolean;
  filter?: string;
  isGuestMode: boolean;
}

export const taskKeys = {
  /** Root prefix matching every tasks-list entry (`["tasks", …]`). */
  all: ["tasks"] as const,

  /**
   * The list entry `useTasks` reads — shape byte-for-byte:
   * `["tasks", { projectId, showCompleted, filter, isGuestMode }]`.
   */
  list: (filters: TaskListFilters) =>
    [
      "tasks",
      {
        projectId: filters.projectId,
        showCompleted: filters.showCompleted ?? false,
        filter: filters.filter,
        isGuestMode: filters.isGuestMode,
      },
    ] as const,

  /**
   * The default-list entry the task commands optimistically write — the
   * pre-command hooks' key, verbatim. `hashKey` drops undefined properties,
   * so this resolves to the same cache entry as `list({ isGuestMode })`.
   */
  defaultList: (isGuestMode?: boolean) =>
    [
      "tasks",
      { projectId: undefined, showCompleted: false, isGuestMode },
    ] as const,

  subtasks: {
    /** Root prefix matching every per-parent subtask list. */
    all: ["subtasks"] as const,
    /**
     * Prefix matching the `["subtasks", parentId, isGuestMode]` entry
     * `useSubtasks` reads — the hooks' prefix invalidations, verbatim.
     */
    of: (parentId: string) => ["subtasks", parentId] as const,
  },

  /** Cache families every landed task write invalidates, verbatim. */
  calendarTasks: ["calendar-tasks"] as const,
  statsDashboard: ["stats-dashboard"] as const,
  focusTasks: ["focus-tasks"] as const,
  taskSeries: ["task-series"] as const,
};
