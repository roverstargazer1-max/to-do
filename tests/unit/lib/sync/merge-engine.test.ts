import { describe, it, expect } from "vitest";
import {
  mergeBackupData,
  resolveConflicts,
  getEntityDifferingFields,
} from "@/lib/sync/merge-engine";
import type { BackupData } from "@/lib/backup/types";
import type { Task, Project } from "@/lib/types/task";
import type { CalendarEvent } from "@/lib/types/calendar-event";
import type { Habit, HabitEntry } from "@/lib/types/habit";
import type { FocusLog } from "@/lib/types/focus";

function createEmptyBackup(): BackupData {
  return {
    metadata: {
      version: 1,
      appVersion: "1.0.0",
      exportedAt: "2026-09-24T00:00:00.000Z",
    },
    tasks: [],
    projects: [],
    habits: [],
    habit_entries: [],
    focus_logs: [],
    events: [],
  };
}

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    user_id: "user-1",
    project_id: null,
    parent_id: null,
    content: "Test Task",
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
    created_at: "2026-09-20T00:00:00.000Z",
    updated_at: "2026-09-20T00:00:00.000Z",
    ...overrides,
  };
}

function createProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-1",
    user_id: "user-1",
    name: "Work",
    color: "#ff0000",
    view_style: "list",
    is_inbox: false,
    is_archived: false,
    created_at: "2026-09-20T00:00:00.000Z",
    updated_at: "2026-09-20T00:00:00.000Z",
    ...overrides,
  };
}

function createEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-1",
    user_id: "user-1",
    title: "Math Class",
    description: null,
    location: null,
    start_time: "2026-09-24T09:00:00.000Z",
    end_time: "2026-09-24T10:30:00.000Z",
    all_day: false,
    color: "#0000ff",
    category: "class",
    recurrence_rule: null,
    remote_id: null,
    remote_calendar_id: null,
    etag: null,
    ics_uid: null,
    sync_state: null,
    is_archived: false,
    metadata: {},
    created_at: "2026-09-20T00:00:00.000Z",
    updated_at: "2026-09-20T00:00:00.000Z",
    ...overrides,
  };
}

function createHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "habit-1",
    user_id: "user-1",
    name: "Morning Run",
    description: null,
    color: "#00ff00",
    icon: "run",
    created_at: "2026-09-20T00:00:00.000Z",
    updated_at: "2026-09-20T00:00:00.000Z",
    archived_at: null,
    start_date: "2026-09-01",
    sort_order: 0,
    ...overrides,
  };
}

function createHabitEntry(overrides: Partial<HabitEntry> = {}): HabitEntry {
  return {
    id: "entry-1",
    habit_id: "habit-1",
    date: "2026-09-24",
    value: 1,
    created_at: "2026-09-24T08:00:00.000Z",
    ...overrides,
  };
}

function createFocusLog(overrides: Partial<FocusLog> = {}): FocusLog {
  return {
    id: "focus-1",
    user_id: "user-1",
    task_id: null,
    start_time: "2026-09-24T14:00:00.000Z",
    end_time: "2026-09-24T14:25:00.000Z",
    duration_seconds: 1500,
    created_at: "2026-09-24T14:25:00.000Z",
    ...overrides,
  };
}

describe("merge-engine", () => {
  describe("getEntityDifferingFields", () => {
    it("ignores user_id, updated_at, created_at, and handles null/undefined equivalence", () => {
      const a = {
        content: "Task 1",
        description: null,
        user_id: "u1",
        updated_at: "2026-09-24T01:00:00Z",
      };
      const b = {
        content: "Task 1",
        description: undefined,
        user_id: "u2",
        updated_at: "2026-09-24T02:00:00Z",
      };
      expect(getEntityDifferingFields(a, b)).toEqual([]);
    });

    it("detects differences in business fields", () => {
      const a = { content: "Task 1", priority: 1 };
      const b = { content: "Task 1 edited", priority: 3 };
      expect(getEntityDifferingFields(a, b)).toEqual(["content", "priority"]);
    });
  });

  describe("Issue 01: Standard 3-Way Merge State Machine Matrix", () => {
    it("returns clean: true and unchanged data when all sides are identical", () => {
      const base = createEmptyBackup();
      const task = createTask();
      base.tasks = [task];
      const local = createEmptyBackup();
      local.tasks = [task];
      const remote = createEmptyBackup();
      remote.tasks = [task];

      const res = mergeBackupData({ base, local, remote });
      expect(res.clean).toBe(true);
      expect(res.conflicts).toHaveLength(0);
      expect(res.mergedData.tasks).toHaveLength(1);
      expect(res.mergedData.tasks[0].id).toBe(task.id);
    });

    it("accepts local modification when remote is unchanged", () => {
      const baseTask = createTask({ content: "Original" });
      const localTask = createTask({
        content: "Local Edited",
        updated_at: "2026-09-24T01:00:00.000Z",
      });
      const remoteTask = createTask({ content: "Original" });

      const base = { ...createEmptyBackup(), tasks: [baseTask] };
      const local = { ...createEmptyBackup(), tasks: [localTask] };
      const remote = { ...createEmptyBackup(), tasks: [remoteTask] };

      const res = mergeBackupData({ base, local, remote });
      expect(res.clean).toBe(true);
      expect(res.conflicts).toHaveLength(0);
      expect(res.mergedData.tasks[0].content).toBe("Local Edited");
      expect(res.stats.updated).toBe(1);
    });

    it("accepts remote modification when local is unchanged", () => {
      const baseTask = createTask({ content: "Original" });
      const localTask = createTask({ content: "Original" });
      const remoteTask = createTask({
        content: "Remote Edited",
        updated_at: "2026-09-24T02:00:00.000Z",
      });

      const base = { ...createEmptyBackup(), tasks: [baseTask] };
      const local = { ...createEmptyBackup(), tasks: [localTask] };
      const remote = { ...createEmptyBackup(), tasks: [remoteTask] };

      const res = mergeBackupData({ base, local, remote });
      expect(res.clean).toBe(true);
      expect(res.mergedData.tasks[0].content).toBe("Remote Edited");
      expect(res.stats.updated).toBe(1);
    });

    it("confirms local deletion when remote is unchanged", () => {
      const baseTask = createTask();
      const base = { ...createEmptyBackup(), tasks: [baseTask] };
      const local = { ...createEmptyBackup(), tasks: [] };
      const remote = { ...createEmptyBackup(), tasks: [baseTask] };

      const res = mergeBackupData({ base, local, remote });
      expect(res.clean).toBe(true);
      expect(res.mergedData.tasks).toHaveLength(0);
      expect(res.stats.deleted).toBe(1);
    });

    it("confirms remote deletion when local is unchanged", () => {
      const baseTask = createTask();
      const base = { ...createEmptyBackup(), tasks: [baseTask] };
      const local = { ...createEmptyBackup(), tasks: [baseTask] };
      const remote = { ...createEmptyBackup(), tasks: [] };

      const res = mergeBackupData({ base, local, remote });
      expect(res.clean).toBe(true);
      expect(res.mergedData.tasks).toHaveLength(0);
      expect(res.stats.deleted).toBe(1);
    });

    it("merges unilateral additions from either side", () => {
      const taskA = createTask({ id: "task-local", content: "New Local" });
      const taskB = createTask({ id: "task-remote", content: "New Remote" });

      const base = createEmptyBackup();
      const local = { ...createEmptyBackup(), tasks: [taskA] };
      const remote = { ...createEmptyBackup(), tasks: [taskB] };

      const res = mergeBackupData({ base, local, remote });
      expect(res.clean).toBe(true);
      expect(res.mergedData.tasks).toHaveLength(2);
      expect(res.stats.added).toBe(2);
    });

    it("detects modify-modify conflict when both sides modified same entity differently", () => {
      const baseTask = createTask({ priority: 3, due_date: null });
      const localTask = createTask({
        priority: 1,
        due_date: "2026-09-25",
        updated_at: "2026-09-24T01:00:00.000Z",
      });
      const remoteTask = createTask({
        priority: 4,
        due_date: "2026-09-26",
        updated_at: "2026-09-24T02:00:00.000Z",
      });

      const base = { ...createEmptyBackup(), tasks: [baseTask] };
      const local = { ...createEmptyBackup(), tasks: [localTask] };
      const remote = { ...createEmptyBackup(), tasks: [remoteTask] };

      const res = mergeBackupData({ base, local, remote });
      expect(res.clean).toBe(false);
      expect(res.conflicts).toHaveLength(1);
      expect(res.conflicts[0].conflictType).toBe("modify-modify");
      expect(res.conflicts[0].differingFields).toContain("priority");
      expect(res.conflicts[0].differingFields).toContain("due_date");
      expect(res.stats.conflicts).toBe(1);
    });

    it("detects modify-delete conflict when local modified but remote deleted", () => {
      const baseTask = createTask({ content: "Base" });
      const localTask = createTask({
        content: "Local Modified",
        updated_at: "2026-09-24T01:00:00.000Z",
      });

      const base = { ...createEmptyBackup(), tasks: [baseTask] };
      const local = { ...createEmptyBackup(), tasks: [localTask] };
      const remote = { ...createEmptyBackup(), tasks: [] };

      const res = mergeBackupData({ base, local, remote });
      expect(res.clean).toBe(false);
      expect(res.conflicts).toHaveLength(1);
      expect(res.conflicts[0].conflictType).toBe("modify-delete");
      expect(res.conflicts[0].local).not.toBeNull();
      expect(res.conflicts[0].remote).toBeNull();
    });

    it("detects delete-modify conflict when local deleted but remote modified", () => {
      const baseTask = createTask({ content: "Base" });
      const remoteTask = createTask({
        content: "Remote Modified",
        updated_at: "2026-09-24T02:00:00.000Z",
      });

      const base = { ...createEmptyBackup(), tasks: [baseTask] };
      const local = { ...createEmptyBackup(), tasks: [] };
      const remote = { ...createEmptyBackup(), tasks: [remoteTask] };

      const res = mergeBackupData({ base, local, remote });
      expect(res.clean).toBe(false);
      expect(res.conflicts).toHaveLength(1);
      expect(res.conflicts[0].conflictType).toBe("delete-modify");
      expect(res.conflicts[0].local).toBeNull();
      expect(res.conflicts[0].remote).not.toBeNull();
    });
  });

  describe("Issue 02: Natural Key Deduplication & Integrity Protection", () => {
    it("deduplicates calendar events by ics_uid", () => {
      const event1 = createEvent({
        id: "ev-local",
        ics_uid: "uid-shared-123",
        title: "Calculus I",
        updated_at: "2026-09-24T01:00:00.000Z",
      });
      const event2 = createEvent({
        id: "ev-remote",
        ics_uid: "uid-shared-123",
        title: "Calculus I Advanced",
        updated_at: "2026-09-24T02:00:00.000Z",
      });

      const base = createEmptyBackup();
      const local = { ...createEmptyBackup(), events: [event1] };
      const remote = { ...createEmptyBackup(), events: [event2] };

      const res = mergeBackupData({ base, local, remote });
      expect(res.clean).toBe(true);
      expect(res.mergedData.events).toHaveLength(1);
      expect(res.mergedData.events[0].id).toBe("ev-remote");
      expect(res.mergedData.events[0].title).toBe("Calculus I Advanced");
      expect(res.stats.deduped).toBe(1);
    });

    it("deduplicates calendar events by title, start_time, and end_time", () => {
      const event1 = createEvent({
        id: "ev-1",
        title: " Physics 101 ",
        start_time: "2026-09-25T10:00:00.000Z",
        end_time: "2026-09-25T11:30:00.000Z",
        updated_at: "2026-09-24T01:00:00.000Z",
      });
      const event2 = createEvent({
        id: "ev-2",
        title: "physics 101",
        start_time: "2026-09-25T10:00:00.000Z",
        end_time: "2026-09-25T11:30:00.000Z",
        updated_at: "2026-09-24T03:00:00.000Z",
      });

      const base = createEmptyBackup();
      const local = { ...createEmptyBackup(), events: [event1] };
      const remote = { ...createEmptyBackup(), events: [event2] };

      const res = mergeBackupData({ base, local, remote });
      expect(res.clean).toBe(true);
      expect(res.mergedData.events).toHaveLength(1);
      expect(res.stats.deduped).toBe(1);
    });

    it("deduplicates tasks by project_id, content, and due_date", () => {
      const task1 = createTask({
        id: "t-local",
        project_id: "p1",
        content: " Submit Assignment ",
        due_date: "2026-09-30",
        is_completed: false,
        updated_at: "2026-09-24T01:00:00.000Z",
      });
      const task2 = createTask({
        id: "t-remote",
        project_id: "p1",
        content: "submit assignment",
        due_date: "2026-09-30",
        is_completed: true,
        completed_at: "2026-09-24T02:00:00.000Z",
        updated_at: "2026-09-24T02:00:00.000Z",
      });

      const base = createEmptyBackup();
      const local = {
        ...createEmptyBackup(),
        projects: [createProject({ id: "p1" })],
        tasks: [task1],
      };
      const remote = {
        ...createEmptyBackup(),
        projects: [createProject({ id: "p1" })],
        tasks: [task2],
      };

      const res = mergeBackupData({ base, local, remote });
      expect(res.clean).toBe(true);
      expect(res.mergedData.tasks).toHaveLength(1);
      expect(res.mergedData.tasks[0].id).toBe("t-remote");
      expect(res.mergedData.tasks[0].is_completed).toBe(true);
      expect(res.stats.deduped).toBe(1);
    });

    it("aggregates habit entries by habit_id and date with logical OR and max value", () => {
      const entry1 = createHabitEntry({
        id: "e-local",
        habit_id: "h1",
        date: "2026-09-24",
        value: 1,
      });
      const entry2 = createHabitEntry({
        id: "e-remote",
        habit_id: "h1",
        date: "2026-09-24",
        value: 5,
      });

      const base = createEmptyBackup();
      const local = { ...createEmptyBackup(), habit_entries: [entry1] };
      const remote = { ...createEmptyBackup(), habit_entries: [entry2] };

      const res = mergeBackupData({ base, local, remote });
      expect(res.clean).toBe(true);
      expect(res.mergedData.habit_entries).toHaveLength(1);
      expect(res.mergedData.habit_entries[0].value).toBe(5);
      expect(res.stats.deduped).toBe(1);
    });

    it("deduplicates focus logs by start_time and duration", () => {
      const log1 = createFocusLog({
        id: "f-1",
        start_time: "2026-09-24T10:00:00.000Z",
        duration_seconds: 1500,
      });
      const log2 = createFocusLog({
        id: "f-2",
        start_time: "2026-09-24T10:00:00.000Z",
        duration_seconds: 1500,
      });
      const log3 = createFocusLog({
        id: "f-3",
        start_time: "2026-09-24T15:00:00.000Z",
        duration_seconds: 1500,
      });

      const base = createEmptyBackup();
      const local = { ...createEmptyBackup(), focus_logs: [log1, log3] };
      const remote = { ...createEmptyBackup(), focus_logs: [log2] };

      const res = mergeBackupData({ base, local, remote });
      expect(res.clean).toBe(true);
      expect(res.mergedData.focus_logs).toHaveLength(2);
      expect(res.stats.deduped).toBe(1);
    });

    it("deduplicates projects by name and remaps task project_id", () => {
      const projLocal = createProject({
        id: "proj-local",
        name: "Research",
        updated_at: "2026-09-24T01:00:00.000Z",
      });
      const projRemote = createProject({
        id: "proj-remote",
        name: " research ",
        updated_at: "2026-09-24T02:00:00.000Z",
      });
      const taskUnderLocal = createTask({
        id: "t-1",
        project_id: "proj-local",
        content: "Write thesis",
      });

      const base = createEmptyBackup();
      const local = {
        ...createEmptyBackup(),
        projects: [projLocal],
        tasks: [taskUnderLocal],
      };
      const remote = { ...createEmptyBackup(), projects: [projRemote] };

      const res = mergeBackupData({ base, local, remote });
      expect(res.clean).toBe(true);
      expect(res.mergedData.projects).toHaveLength(1);
      expect(res.mergedData.projects[0].id).toBe("proj-remote");
      // Task's project_id was remapped from proj-local to proj-remote
      expect(res.mergedData.tasks[0].project_id).toBe("proj-remote");
    });

    it("protects orphaned tasks when parent project is deleted (reassigns to Inbox)", () => {
      const proj = createProject({
        id: "proj-to-delete",
        name: "Archive Proj",
      });
      const task = createTask({
        id: "t-1",
        project_id: "proj-to-delete",
        content: "Review docs",
      });

      // Base had both project and task
      const base = {
        ...createEmptyBackup(),
        projects: [proj],
        tasks: [task],
      };
      // Local deleted the project, but kept the task
      const local = {
        ...createEmptyBackup(),
        projects: [],
        tasks: [task],
      };
      // Remote kept both untouched
      const remote = {
        ...createEmptyBackup(),
        projects: [proj],
        tasks: [task],
      };

      const res = mergeBackupData({ base, local, remote });
      expect(res.clean).toBe(true);
      expect(res.mergedData.projects).toHaveLength(0); // project deleted
      expect(res.mergedData.tasks).toHaveLength(1);
      // Project is gone, so task is demoted to Inbox (project_id: null)
      expect(res.mergedData.tasks[0].project_id).toBeNull();
      expect(res.stats.orphanedTasksReassigned).toBe(1);
    });
  });

  describe("Fallback Mode (Base is null)", () => {
    it("safely unions data without throwing errors or false conflicts", () => {
      const taskLocal = createTask({ id: "t1", content: "Task from Local" });
      const taskRemote = createTask({ id: "t2", content: "Task from Remote" });

      const local = { ...createEmptyBackup(), tasks: [taskLocal] };
      const remote = { ...createEmptyBackup(), tasks: [taskRemote] };

      const res = mergeBackupData({ base: null, local, remote });
      expect(res.clean).toBe(true);
      expect(res.mergedData.tasks).toHaveLength(2);
      expect(res.stats.added).toBe(2);
    });
  });

  describe("resolveConflicts helper", () => {
    it("resolves conflicts with local choice", () => {
      const baseTask = createTask({ priority: 3 });
      const localTask = createTask({ priority: 1 });
      const remoteTask = createTask({ priority: 4 });

      const base = { ...createEmptyBackup(), tasks: [baseTask] };
      const local = { ...createEmptyBackup(), tasks: [localTask] };
      const remote = { ...createEmptyBackup(), tasks: [remoteTask] };

      const mergeRes = mergeBackupData({ base, local, remote });
      expect(mergeRes.clean).toBe(false);

      const resolved = resolveConflicts({
        mergeResult: mergeRes,
        resolutions: { "task-1": "local" },
      });
      expect(resolved.tasks).toHaveLength(1);
      expect(resolved.tasks[0].priority).toBe(1);
    });

    it("resolves conflicts with remote choice", () => {
      const baseTask = createTask({ priority: 3 });
      const localTask = createTask({ priority: 1 });
      const remoteTask = createTask({ priority: 4 });

      const base = { ...createEmptyBackup(), tasks: [baseTask] };
      const local = { ...createEmptyBackup(), tasks: [localTask] };
      const remote = { ...createEmptyBackup(), tasks: [remoteTask] };

      const mergeRes = mergeBackupData({ base, local, remote });

      const resolved = resolveConflicts({
        mergeResult: mergeRes,
        resolutions: { "task-1": "remote" },
      });
      expect(resolved.tasks).toHaveLength(1);
      expect(resolved.tasks[0].priority).toBe(4);
    });

    it("resolves conflicts with duplicate choice, preserving both versions", () => {
      const baseTask = createTask({ content: "Original Idea" });
      const localTask = createTask({ content: "Idea version A" });
      const remoteTask = createTask({ content: "Idea version B" });

      const base = { ...createEmptyBackup(), tasks: [baseTask] };
      const local = { ...createEmptyBackup(), tasks: [localTask] };
      const remote = { ...createEmptyBackup(), tasks: [remoteTask] };

      const mergeRes = mergeBackupData({ base, local, remote });

      const resolved = resolveConflicts({
        mergeResult: mergeRes,
        resolutions: { "task-1": "duplicate" },
      });
      expect(resolved.tasks).toHaveLength(2);
      const contents = resolved.tasks.map((t) => t.content);
      expect(contents).toContain("Idea version B");
      expect(contents.some((c) => c.includes("Idea version A"))).toBe(true);
    });
  });
});
