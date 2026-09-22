import type { BackupData } from "@/lib/backup/types";
import type { Task } from "@/lib/types/task";
import type { Workspace } from "@/lib/types/workspace";
import { makeHabit } from "./habitFixtures";

export const emptyBackup: BackupData = {
  metadata: {
    version: 1,
    appVersion: "1.5.0",
    exportedAt: "2026-09-22T00:00:00.000Z",
  },
  tasks: [],
  projects: [],
  habits: [],
  habit_entries: [],
  focus_logs: [],
  events: [],
};

function makeTask(id: string): Task {
  return {
    id,
    user_id: "u1",
    project_id: null,
    parent_id: null,
    content: "task",
    description: null,
    priority: 3,
    due_date: null,
    do_date: null,
    is_evening: false,
    is_completed: false,
    completed_at: null,
    day_order: 0,
    recurrence: null,
    recurring_series_id: null,
    google_event_id: null,
    google_etag: null,
    created_at: "2026-09-22T00:00:00.000Z",
    updated_at: "2026-09-22T00:00:00.000Z",
  };
}

function makeWorkspace(id: string): Workspace {
  return {
    id,
    user_id: "u1",
    name: `ws-${id}`,
    created_at: "2026-09-22T00:00:00.000Z",
    updated_at: "2026-09-22T00:00:00.000Z",
  };
}

/** Typed BackupData-with-N-entries helper (no type escapes). */
export function backupWith(
  counts: {
    tasks?: number;
    habits?: number;
    workspaces?: number;
  } = {},
): BackupData {
  const { tasks = 0, habits = 0, workspaces = 0 } = counts;
  return {
    ...emptyBackup,
    tasks: Array.from({ length: tasks }, (_, i) => makeTask(`task-${i}`)),
    habits: Array.from({ length: habits }, (_, i) =>
      makeHabit({ id: `habit-${i}`, name: `habit-${i}` }),
    ),
    workspaces: Array.from({ length: workspaces }, (_, i) =>
      makeWorkspace(`ws-${i}`),
    ),
  };
}
