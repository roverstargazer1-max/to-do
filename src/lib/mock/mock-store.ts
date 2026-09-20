/**
 * Mock Data Store for Guest Mode
 * Provides in-memory CRUD operations with localStorage persistence
 */

import { isWeekend } from "date-fns";
import * as Sentry from "@sentry/nextjs";
import type { Task, Project } from "@/lib/types/task";
import type { RecurrenceRule } from "@/lib/utils/recurrence";
import type { Habit, HabitEntry } from "@/lib/types/habit";
import type { FocusLog } from "@/lib/types/focus";
import type { CalendarEvent } from "@/lib/types/calendar-event";
import type { BackupData } from "@/lib/backup/types";
import { getLocalDal } from "@/lib/api/local-dal";

export const STORAGE_KEY = "kanso_guest_data_v11";

export interface GuestData {
  tasks: Task[];
  projects: Project[];
  habits: Habit[];
  habit_entries: HabitEntry[];
  focus_logs: FocusLog[];
  events: CalendarEvent[];
  lastUpdated: string;
  // Optional so guest sessions persisted before this field existed still deserialize.
  seed_ids?: string[];
}

type BackupPayload = Omit<BackupData, "metadata">;

class MockStore {
  private data: GuestData;

  constructor() {
    const stored = this.loadFromStorage();
    if (stored) {
      this.data = stored;
    } else {
      this.data = this.getInitialData();
      this.saveToStorage();
    }
  }

  private getInitialData(): GuestData {
    const now = new Date();
    const nowIso = now.toISOString();
    const oneDay = 86400000;
    const startOfHistory = new Date(now.getTime() - 365 * oneDay)
      .toISOString()
      .split("T")[0];

    const pWork = "demo-project-work";
    const pPersonal = "demo-project-personal";
    const pSide = "demo-project-side";

    const projects: Project[] = [
      {
        id: pWork,
        user_id: "guest",
        name: "Work",
        color: "#4B6CB7", // Kagelin Blue
        view_style: "list",
        is_inbox: false,
        is_archived: false,
        created_at: nowIso,
        updated_at: nowIso,
      },
      {
        id: pPersonal,
        user_id: "guest",
        name: "Personal",
        color: "#839B82", // Muted Sage
        view_style: "list",
        is_inbox: false,
        is_archived: false,
        created_at: nowIso,
        updated_at: nowIso,
      },
      {
        id: pSide,
        user_id: "guest",
        name: "Side Project",
        color: "#8B6B80", // Plum
        view_style: "board",
        is_inbox: false,
        is_archived: false,
        created_at: nowIso,
        updated_at: nowIso,
      },
    ];

    const tasks: Task[] = [];
    const logs: FocusLog[] = [];
    const habits: Habit[] = [];
    const entries: HabitEntry[] = [];
    const events: CalendarEvent[] = [];

    const generateId = () => Math.random().toString(36).substr(2, 9);
    const pick = <T>(options: readonly T[]) =>
      options[Math.floor(Math.random() * options.length)];
    const dayAt = (dayOffset: number) =>
      new Date(now.getTime() + dayOffset * oneDay);
    const randomPriority = (min: 1 | 2 | 3, max: 3 | 4) =>
      (min + Math.floor(Math.random() * (max - min + 1))) as 1 | 2 | 3 | 4;

    const deepWork = [
      "Deep work: checkout refactor",
      "Deep work: search indexing",
      "Deep work: API rate limiting",
      "Ship feature flag rollout",
      "Trace latency regression",
      "Fix flaky integration test",
      "Write RFC for caching layer",
      "Break down the sync epic",
    ] as const;

    const collabWork = [
      "Daily standup",
      "Review pull requests",
      "Pair on onboarding bug",
      "Sprint planning",
      "Backlog grooming",
      "1:1 with manager",
      "Update the design doc",
      "Triage incoming bugs",
      "Team retro",
    ] as const;

    const eveningLife = [
      "Side project: an hour on the sync engine",
      "Read through a library's source",
      "Sketch practice",
      "Figure drawing study",
      "Ink a page",
      "Co-op session with friends",
      "Ranked matches",
      "Finish the campaign chapter",
      "Call parents",
      "Cook dinner together",
      "Board game night",
      "Read a chapter",
    ] as const;

    const sideProject = [
      "Draft the next blog post",
      "Refactor the plugin API",
      "Fix the issue a user filed",
      "Redraw the app icon",
      "Write release notes",
      "Cut a release",
    ] as const;

    const weekendLife = [
      "Long walk with family",
      "Brunch with friends",
      "Sketch at the park",
      "Side project: ship a small feature",
      "Game night",
      "Farmers market run",
      "Tidy the flat",
      "Family video call",
    ] as const;

    const createTask = (
      content: string,
      dayOffset: number,
      projectId: string,
      options: {
        priority?: 1 | 2 | 3 | 4;
        isEvening?: boolean;
        parentId?: string | null;
        // Only consulted for past days; future tasks are always pending.
        completionRate?: number;
      } = {},
    ) => {
      const {
        priority = 4,
        isEvening = false,
        parentId = null,
        completionRate = 0,
      } = options;
      const date = dayAt(dayOffset);

      const randomHour = isEvening
        ? 18 + Math.random() * 4 // 18:00 - 22:00
        : 8 + Math.random() * 6; // 08:00 - 14:00
      const randomMinute = Math.floor(Math.random() * 60);
      date.setHours(Math.floor(randomHour), randomMinute, 0, 0);

      const dueDate = date.toISOString();
      const isPast = dayOffset < 0;
      const isCompleted = isPast && Math.random() < completionRate;

      const taskId = `task-${generateId()}`;

      tasks.push({
        id: taskId,
        user_id: "guest",
        content,
        description: null,
        is_completed: isCompleted,
        completed_at: isCompleted ? dueDate : null,
        priority,
        project_id: projectId,
        day_order: tasks.length,
        created_at: new Date(date.getTime() - 86400000).toISOString(),
        updated_at: dueDate,
        due_date: dueDate,
        do_date: null,
        is_evening: isEvening,
        parent_id: parentId,
        recurrence: null,
        recurring_series_id: null,
        google_event_id: null,
        google_etag: null,
      });

      if (isCompleted) {
        const durationSeconds = 900 + Math.floor(Math.random() * 7200); // 15m to 2h
        logs.push({
          id: `log-${generateId()}`,
          user_id: "guest",
          task_id: taskId,
          start_time: dueDate,
          end_time: new Date(
            date.getTime() + durationSeconds * 1000,
          ).toISOString(),
          duration_seconds: durationSeconds,
          created_at: dueDate,
        });
      }

      return taskId;
    };

    // Generate Past 365 Days (History for Stats)
    for (let i = -365; i < 0; i++) {
      const date = dayAt(i);
      const monthOffset = Math.abs(i) / 30;

      // Higher probability of activity overall to fill heatmap
      let probability = 0.8; // Boosted for positive stats
      if (monthOffset > 4) probability = 0.6;
      if (monthOffset > 8) probability = 0.45;

      if (Math.abs(i) <= 30) probability = 0.92;

      if (Math.random() > probability) continue;

      if (isWeekend(date)) {
        const count = Math.random() > 0.4 ? 2 : 1;
        for (let t = 0; t < count; t++) {
          createTask(
            pick(weekendLife),
            i,
            Math.random() > 0.75 ? pSide : pPersonal,
            {
              priority: randomPriority(3, 4),
              isEvening: Math.random() > 0.5,
              completionRate: 0.85,
            },
          );
        }
        continue;
      }

      createTask(pick(deepWork), i, pWork, {
        priority: 2,
        completionRate: 0.85,
      });

      const collabCount = Math.abs(i) <= 30 ? 3 : 2;
      for (let t = 0; t < collabCount; t++) {
        if (Math.random() > 0.7) continue;
        createTask(pick(collabWork), i, pWork, {
          priority: randomPriority(1, 3),
          completionRate: 0.75,
        });
      }

      if (Math.random() < 0.8) {
        createTask(pick(eveningLife), i, pPersonal, {
          isEvening: true,
          completionRate: 0.8,
        });
      }
    }

    for (let i = 0; i <= 30; i++) {
      if (i === 0) {
        const parentId = createTask(
          "Ship search filters to staging",
          0,
          pWork,
          {
            priority: 1,
          },
        );
        createTask("Wire up the query params", 0, pWork, {
          priority: 2,
          parentId,
        });
        const subtaskId = createTask("Polish the empty state", 0, pWork, {
          priority: 3,
          parentId,
        });
        createTask("Copy review", 0, pWork, {
          priority: 3,
          parentId: subtaskId,
        });
        createTask("Loading skeleton", 0, pWork, {
          priority: 4,
          parentId: subtaskId,
        });
        createTask("Cross-browser check", 0, pWork, { priority: 2, parentId });

        createTask("Review pull requests", 0, pWork, { priority: 1 });
        createTask("Daily standup", 0, pWork, { priority: 2 });
        createTask("Call parents", 0, pPersonal, {
          priority: 3,
          isEvening: true,
        });
        createTask("Gym session", 0, pPersonal, { priority: 2 });
        createTask("Grocery run", 0, pPersonal, { priority: 4 });
        createTask("Sketch practice", 0, pPersonal, {
          priority: 4,
          isEvening: true,
        });
        continue;
      }

      if (isWeekend(dayAt(i))) {
        const count = Math.random() > 0.5 ? 2 : 1;
        for (let t = 0; t < count; t++) {
          createTask(pick(weekendLife), i, pPersonal, {
            isEvening: Math.random() > 0.5,
          });
        }
      } else {
        const isHighDensity = Math.random() > 0.8;
        const count = isHighDensity ? 4 : Math.random() > 0.4 ? 2 : 0;

        for (let t = 0; t < count; t++) {
          createTask(t === 0 ? pick(deepWork) : pick(collabWork), i, pWork, {
            priority: randomPriority(1, 3),
          });
        }

        if (Math.random() < 0.7) {
          createTask(pick(eveningLife), i, pPersonal, { isEvening: true });
        }
      }

      if (i % 3 === 0) createTask(pick(sideProject), i, pSide, { priority: 2 });
      if (i % 7 === 0)
        createTask("Weekly planning", i, pPersonal, { priority: 1 });
    }

    // Recurring task Series: ~16 weeks of history + one active Occurrence, all
    // sharing a recurring_series_id, so guest-mode Task Insights (streaks,
    // on-time %, History heatmap) has more than a single data point to chart.
    const seriesId = `series-${generateId()}`;
    const weeklyRecurrence: RecurrenceRule = { freq: "WEEKLY", interval: 1 };
    const seriesWeeks = 16;

    for (let w = seriesWeeks; w >= 0; w--) {
      const dueDate = new Date(now.getTime() - w * 7 * oneDay);
      dueDate.setHours(9, 0, 0, 0);

      const isActiveOccurrence = w === 0;
      // ~80% completion rate for past Occurrences; the current one is pending.
      const isCompleted = !isActiveOccurrence && Math.random() > 0.2;

      let completedAt: string | null = null;
      if (isCompleted) {
        // ~25% of completions run up to 2 days late.
        const lateMs =
          Math.random() > 0.75 ? Math.floor(Math.random() * 2 * oneDay) : 0;
        completedAt = new Date(dueDate.getTime() + lateMs).toISOString();
      }

      tasks.push({
        id: `task-${generateId()}`,
        user_id: "guest",
        content: "Weekly Review",
        description: null,
        is_completed: isCompleted,
        completed_at: completedAt,
        priority: 2,
        project_id: pWork,
        day_order: tasks.length,
        created_at: new Date(dueDate.getTime() - oneDay).toISOString(),
        updated_at: completedAt ?? dueDate.toISOString(),
        due_date: dueDate.toISOString(),
        do_date: null,
        is_evening: false,
        parent_id: null,
        recurrence: weeklyRecurrence,
        recurring_series_id: seriesId,
        google_event_id: null,
        google_etag: null,
      });
    }

    const hWater = "habit-water";
    const hExercise = "habit-exercise";
    const hRead = "habit-read";
    const hSketch = "habit-sketch";
    const hSideCode = "habit-side-code";
    const hLogOff = "habit-log-off";

    habits.push(
      {
        id: hWater,
        user_id: "guest",
        name: "Drink Water",
        description: "8 glasses a day",
        color: "#5B7C99", // Earthy Blue
        icon: "Droplet",
        created_at: nowIso,
        updated_at: nowIso,
        archived_at: null,
        start_date: startOfHistory,
        sort_order: 0,
        habit_type: "measurable",
        frequency_count: 1,
        frequency_period: "day",
        target_type: "at_least",
        target_value: 8,
        unit: "glasses",
      },
      {
        id: hExercise,
        user_id: "guest",
        name: "Morning Exercise",
        description: "30 mins activity",
        color: "#A3B18A", // Muted Mint
        icon: "Dumbbell",
        created_at: nowIso,
        updated_at: nowIso,
        archived_at: null,
        start_date: startOfHistory,
        sort_order: 1,
        habit_type: "boolean",
        frequency_count: 5,
        frequency_period: "week",
        target_type: "at_least",
        target_value: null,
        unit: null,
      },
      {
        id: hRead,
        user_id: "guest",
        name: "Read",
        description: "20 pages",
        color: "#9F8189", // Lavender
        icon: "Book",
        created_at: nowIso,
        updated_at: nowIso,
        archived_at: null,
        start_date: startOfHistory,
        sort_order: 2,
        habit_type: "boolean",
        frequency_count: 7,
        frequency_period: "week",
        target_type: "at_least",
        target_value: null,
        unit: null,
      },
      {
        id: hSketch,
        user_id: "guest",
        name: "Sketch",
        description: "Fill a page",
        color: "#8B6B80", // Plum
        icon: "Pencil",
        created_at: nowIso,
        updated_at: nowIso,
        archived_at: null,
        start_date: startOfHistory,
        sort_order: 3,
        habit_type: "boolean",
        frequency_count: 3,
        frequency_period: "week",
        target_type: "at_least",
        target_value: null,
        unit: null,
      },
      {
        id: hSideCode,
        user_id: "guest",
        name: "Code for Fun",
        description: "Commit something small",
        color: "#6B8E8A", // Muted Teal
        icon: "Code",
        created_at: nowIso,
        updated_at: nowIso,
        archived_at: null,
        start_date: startOfHistory,
        sort_order: 4,
        habit_type: "boolean",
        frequency_count: 3,
        frequency_period: "week",
        target_type: "at_least",
        target_value: null,
        unit: null,
      },
      {
        id: hLogOff,
        user_id: "guest",
        name: "Log Off by 18:00",
        description: "Close the laptop, start the evening",
        color: "#A48C7A", // Warm Taupe
        icon: "Moon",
        created_at: nowIso,
        updated_at: nowIso,
        archived_at: null,
        start_date: startOfHistory,
        sort_order: 5,
        habit_type: "boolean",
        frequency_count: 4,
        frequency_period: "week",
        target_type: "at_least",
        target_value: null,
        unit: null,
      },
    );

    // Marked often enough to clear each habit's frequency_count (ADR-0004
    // streaks read those fields), but patchy day to day.
    const habitPatterns: {
      habitId: string;
      weekday: number;
      weekend: number;
      value?: () => number;
    }[] = [
      {
        habitId: hWater,
        weekday: 0.9,
        weekend: 0.8,
        value: () => 4 + Math.floor(Math.random() * 7), // 4-10 glasses
      },
      { habitId: hExercise, weekday: 0.85, weekend: 0.45 },
      { habitId: hRead, weekday: 0.6, weekend: 0.7 },
      { habitId: hSketch, weekday: 0.4, weekend: 0.6 },
      { habitId: hSideCode, weekday: 0.4, weekend: 0.65 },
      { habitId: hLogOff, weekday: 0.85, weekend: 0 },
    ];

    for (let i = -365; i <= 0; i++) {
      const date = dayAt(i);
      const dateStr = date.toISOString().split("T")[0];

      for (const pattern of habitPatterns) {
        const probability = isWeekend(date) ? pattern.weekend : pattern.weekday;
        if (Math.random() >= probability) continue;

        entries.push({
          id: `entry-${generateId()}`,
          habit_id: pattern.habitId,
          date: dateStr,
          value: pattern.value ? pattern.value() : 1,
          created_at: nowIso,
        });
      }
    }

    const mockLocations = ["Coffee Shop", "Office", "Zoom", "Gym", "Home"];
    const workdayEvents = [
      "Design review",
      "Sprint planning",
      "1:1 with manager",
      "Team retro",
      "Architecture sync",
      "Product demo",
      "Incident postmortem",
    ] as const;
    const weekendEvents = [
      "Coffee with a friend",
      "Family lunch",
      "Life drawing class",
      "Raid night",
      "Football with the team",
    ] as const;

    for (let i = -7; i <= 14; i++) {
      const date = dayAt(i);
      const weekend = isWeekend(date);

      if (Math.random() > 0.4) {
        const randomHour = weekend
          ? 11 + Math.floor(Math.random() * 8) // 11am to 6pm
          : 9 + Math.floor(Math.random() * 8); // 9am to 4pm
        const startTime = new Date(date);
        startTime.setHours(randomHour, 0, 0, 0);
        const endTime = new Date(startTime.getTime() + 3600000); // 1 hour

        const id = `event-${generateId()}`;
        const title = weekend ? pick(weekendEvents) : pick(workdayEvents);
        events.push({
          id,
          user_id: "guest",
          title: i === 0 && !weekend ? "Team catch up" : title,
          description: null,
          location: Math.random() > 0.5 ? pick(mockLocations) : null,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          all_day: false,
          color: "#4B6CB7", // Kagelin brand
          category: "event",
          recurrence_rule: null,
          remote_id: null,
          remote_calendar_id: null,
          etag: null,
          ics_uid: null,
          sync_state: null,
          is_archived: false,
          metadata: {},
          created_at: nowIso,
          updated_at: nowIso,
        });
      }
    }

    return {
      tasks,
      projects,
      habits,
      habit_entries: entries,
      focus_logs: logs,
      events,
      lastUpdated: nowIso,
      seed_ids: [
        ...habits.map((h) => h.id),
        ...tasks.map((t) => t.id),
        ...projects.map((p) => p.id),
        ...events.map((e) => e.id),
      ],
    };
  }

  private loadFromStorage(): GuestData | null {
    if (typeof window === "undefined") return null;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  private saveToStorage(): void {
    if (typeof window === "undefined") return;

    this.data.lastUpdated = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (error) {
      // Never swallow: a failed write means the guest's data is gone on
      // reload, and a silent success toast is worse than a visible error.
      // Reported here rather than at the call sites: this is the only place
      // guest data reaches storage, so every write is covered once.
      Sentry.captureException(error);
      throw new Error(
        "Failed to save guest data — browser storage may be full.",
        { cause: error },
      );
    }
  }

  getTasks(): Task[] {
    const dal = getLocalDal();
    if (dal) {
      try {
        const rows = dal.tasks.list({ showCompleted: true });
        if (rows && rows.length > 0) return rows;
      } catch {}
    }
    return this.data.tasks;
  }

  getTask(id: string): Task | null {
    const dal = getLocalDal();
    if (dal) {
      try {
        const row = dal.tasks.getById(id);
        if (row) return row;
      } catch {}
    }
    return this.data.tasks.find((t) => t.id === id) || null;
  }

  getSubtasks(parentId: string): Task[] {
    const dal = getLocalDal();
    if (dal) {
      try {
        const rows = dal.tasks
          .list({ showCompleted: true })
          .filter((t) => t.parent_id === parentId);
        if (rows && rows.length > 0) return rows;
      } catch {}
    }
    return this.data.tasks.filter((t) => t.parent_id === parentId);
  }

  addTask(
    task: Partial<
      Omit<Task, "id" | "user_id" | "created_at" | "updated_at">
    > & {
      content: string;
      id?: string;
    },
  ): Task {
    const now = new Date().toISOString();
    const newTask: Task = {
      project_id: task.project_id ?? null,
      parent_id: task.parent_id ?? null,
      description: task.description ?? null,
      priority: task.priority ?? 4,
      due_date: task.due_date ?? null,
      do_date: task.do_date ?? null,
      is_evening: task.is_evening ?? false,
      is_completed: task.is_completed ?? false,
      completed_at: task.completed_at ?? null,
      day_order: task.day_order ?? this.data.tasks.length,
      recurrence: task.recurrence ?? null,
      recurring_series_id: task.recurring_series_id ?? null,
      google_event_id: task.google_event_id ?? null,
      google_etag: task.google_etag ?? null,
      content: task.content,
      id:
        task.id ||
        `guest-task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      user_id: "guest",
      created_at: now,
      updated_at: now,
    };

    // A fresh-id Occurrence of a seeded Series (spawned by taskMutations.toggle) is still demo content.
    if (
      newTask.recurring_series_id &&
      this.data.tasks.some(
        (t) =>
          t.recurring_series_id === newTask.recurring_series_id &&
          this.isSeedId(t.id),
      )
    ) {
      this.data.seed_ids = [...(this.data.seed_ids ?? []), newTask.id];
    }

    this.data.tasks = [...this.data.tasks, newTask];
    this.saveToStorage();

    const dal = getLocalDal();
    if (dal) {
      try {
        if (dal.tasks.getById(newTask.id)) {
          dal.tasks.update(newTask.id, newTask);
        } else {
          dal.tasks.create({
            id: newTask.id,
            user_id: newTask.user_id,
            content: newTask.content,
            description: newTask.description,
            priority: newTask.priority,
            due_date: newTask.due_date,
            do_date: newTask.do_date,
            is_evening: newTask.is_evening,
            is_completed: newTask.is_completed,
            completed_at: newTask.completed_at,
            project_id: newTask.project_id,
            parent_id: newTask.parent_id,
            day_order: newTask.day_order,
            recurrence: newTask.recurrence,
            recurring_series_id: newTask.recurring_series_id,
            google_event_id: newTask.google_event_id,
            google_etag: newTask.google_etag,
            created_at: newTask.created_at,
            updated_at: newTask.updated_at,
          });
        }
      } catch {}
    }

    return newTask;
  }

  updateTask(id: string, updates: Partial<Task>): Task | null {
    const index = this.data.tasks.findIndex((t) => t.id === id);
    if (index === -1) return null;

    const updatedTasks = [...this.data.tasks];
    updatedTasks[index] = {
      ...updatedTasks[index],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.data.tasks = updatedTasks;

    this.saveToStorage();

    const dal = getLocalDal();
    if (dal) {
      try {
        dal.tasks.update(id, updates);
      } catch {}
    }

    return this.data.tasks[index];
  }

  deleteTask(id: string): boolean {
    const index = this.data.tasks.findIndex((t) => t.id === id);
    if (index === -1) return false;

    this.data.tasks = this.data.tasks.filter((t) => t.id !== id);
    this.unmarkSeedId(id);
    this.saveToStorage();

    const dal = getLocalDal();
    if (dal) {
      try {
        dal.tasks.delete(id);
      } catch {}
    }

    return true;
  }

  getProjects(): Project[] {
    const dal = getLocalDal();
    if (dal) {
      try {
        const rows = dal.projects.list();
        if (rows && rows.length > 0) return rows;
      } catch {}
    }
    return this.data.projects;
  }

  getProject(id: string): Project | null {
    const dal = getLocalDal();
    if (dal) {
      try {
        return dal.projects.getById(id);
      } catch {}
    }
    return this.data.projects.find((p) => p.id === id) || null;
  }

  addProject(
    project: Omit<Project, "id" | "user_id" | "created_at" | "updated_at">,
  ): Project {
    const now = new Date().toISOString();
    const passedId = (project as { id?: string }).id;
    const newProject: Project = {
      ...project,
      id:
        passedId ||
        `guest-project-${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 9)}`,
      user_id: "guest",
      created_at: now,
      updated_at: now,
    };

    this.data.projects = [...this.data.projects, newProject];
    this.saveToStorage();

    const dal = getLocalDal();
    if (dal) {
      try {
        if (dal.projects.getById(newProject.id)) {
          dal.projects.update(newProject.id, newProject);
        } else {
          dal.projects.create({
            id: newProject.id,
            name: newProject.name,
            color: newProject.color,
            view_style: newProject.view_style,
            is_inbox: newProject.is_inbox,
            is_archived: newProject.is_archived,
          });
        }
      } catch {}
    }

    return newProject;
  }

  updateProject(id: string, updates: Partial<Project>): Project | null {
    const index = this.data.projects.findIndex((p) => p.id === id);
    if (index === -1) return null;

    const updatedProjects = [...this.data.projects];
    updatedProjects[index] = {
      ...updatedProjects[index],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.data.projects = updatedProjects;

    this.saveToStorage();

    const dal = getLocalDal();
    if (dal) {
      try {
        dal.projects.update(id, updates);
      } catch {}
    }

    return this.data.projects[index];
  }

  deleteProject(id: string): boolean {
    const index = this.data.projects.findIndex((p) => p.id === id);
    if (index === -1) return false;

    this.data.projects = this.data.projects.filter((p) => p.id !== id);
    this.unmarkSeedId(id);
    this.saveToStorage();

    const dal = getLocalDal();
    if (dal) {
      try {
        dal.projects.delete(id);
      } catch {}
    }

    return true;
  }

  moveTasksToInbox(projectId: string): void {
    let changed = false;
    this.data.tasks = this.data.tasks.map((t) => {
      if (t.project_id === projectId) {
        changed = true;
        return {
          ...t,
          project_id: null,
          updated_at: new Date().toISOString(),
        };
      }
      return t;
    });
    if (changed) this.saveToStorage();
  }

  deleteTasksByProject(projectId: string): void {
    const initialLength = this.data.tasks.length;
    this.data.tasks = this.data.tasks.filter((t) => t.project_id !== projectId);
    if (this.data.tasks.length !== initialLength) {
      this.saveToStorage();
    }
  }

  getFocusLogs(): FocusLog[] {
    const dal = getLocalDal();
    if (dal) {
      try {
        return dal.focus.list();
      } catch {}
    }
    return this.data.focus_logs || [];
  }

  addFocusLog(log: Omit<FocusLog, "id" | "created_at">): FocusLog {
    const now = new Date().toISOString();
    const newLog: FocusLog = {
      ...log,
      id: `guest-log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      created_at: now,
    };

    if (!this.data.focus_logs) this.data.focus_logs = [];
    this.data.focus_logs = [...this.data.focus_logs, newLog];
    this.saveToStorage();

    const dal = getLocalDal();
    if (dal) {
      try {
        dal.focus.create(newLog);
      } catch {}
    }

    return newLog;
  }

  getHabits(): Habit[] {
    const dal = getLocalDal();
    if (dal) {
      try {
        const rows = dal.habits.list();
        if (rows && rows.length > 0) return rows;
      } catch {}
    }
    return this.data.habits || [];
  }

  getHabitEntries(habitId?: string): HabitEntry[] {
    if (!this.data.habit_entries) return [];
    if (habitId) {
      return this.data.habit_entries.filter((e) => e.habit_id === habitId);
    }
    return this.data.habit_entries;
  }

  addHabit(
    habit: Omit<
      Habit,
      "id" | "user_id" | "created_at" | "updated_at" | "sort_order"
    >,
  ): Habit {
    const now = new Date().toISOString();
    const newHabit: Habit = {
      ...habit,
      id: `guest-habit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      user_id: "guest",
      created_at: now,
      updated_at: now,
      start_date: habit.start_date || now.split("T")[0],
      sort_order: (this.data.habits || []).length,
    };

    if (!this.data.habits) this.data.habits = [];
    this.data.habits = [...this.data.habits, newHabit];
    this.saveToStorage();

    const dal = getLocalDal();
    if (dal) {
      try {
        if (dal.habits.getById(newHabit.id)) {
          dal.habits.update(newHabit.id, newHabit);
        } else {
          dal.habits.create(newHabit);
        }
      } catch {}
    }

    return newHabit;
  }

  updateHabit(id: string, updates: Partial<Habit>): Habit | null {
    const index = this.data.habits.findIndex((h) => h.id === id);
    if (index === -1) return null;

    const updatedHabits = [...this.data.habits];
    updatedHabits[index] = {
      ...updatedHabits[index],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.data.habits = updatedHabits;

    this.saveToStorage();

    const dal = getLocalDal();
    if (dal) {
      try {
        dal.habits.update(id, updates);
      } catch {}
    }

    return this.data.habits[index];
  }

  deleteHabit(id: string): boolean {
    const index = this.data.habits.findIndex((h) => h.id === id);
    if (index === -1) return false;

    this.data.habits = this.data.habits.filter((h) => h.id !== id);
    this.data.habit_entries = this.data.habit_entries.filter(
      (e) => e.habit_id !== id,
    );
    this.unmarkSeedId(id);

    this.saveToStorage();

    const dal = getLocalDal();
    if (dal) {
      try {
        dal.habits.delete(id);
      } catch {}
    }

    return true;
  }

  // Idempotent value-set (mirrors the Supabase upsert): value 0 clears the day,
  // value > 0 writes that exact value. Repeated calls with the same value
  // converge instead of flipping, so optimistic double-taps don't desync the
  // cache from the store.
  setHabitEntry(
    habitId: string,
    date: string,
    value: number,
  ): HabitEntry | null {
    const existingIndex = this.data.habit_entries.findIndex(
      (e) => e.habit_id === habitId && e.date === date,
    );

    if (value === 0) {
      if (existingIndex !== -1) {
        this.data.habit_entries = this.data.habit_entries.filter(
          (_, i) => i !== existingIndex,
        );
        this.saveToStorage();
      }
      return null;
    }

    if (existingIndex !== -1) {
      const updated: HabitEntry = {
        ...this.data.habit_entries[existingIndex],
        value,
      };
      this.data.habit_entries = this.data.habit_entries.map((e, i) =>
        i === existingIndex ? updated : e,
      );
      this.saveToStorage();
      return updated;
    }

    const newEntry: HabitEntry = {
      id: `guest-entry-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`,
      habit_id: habitId,
      date,
      value,
      created_at: new Date().toISOString(),
    };
    this.data.habit_entries = [...this.data.habit_entries, newEntry];
    this.saveToStorage();

    const dal = getLocalDal();
    if (dal) {
      try {
        dal.habits.upsertEntry(habitId, date, value);
      } catch {}
    }

    return newEntry;
  }

  getEvents(): CalendarEvent[] {
    const dal = getLocalDal();
    if (dal) {
      try {
        const rows = dal.calendar.list();
        if (rows && rows.length > 0) return rows;
      } catch {}
    }
    return this.data.events || [];
  }

  addEvent(
    event: Omit<
      CalendarEvent,
      "id" | "user_id" | "created_at" | "updated_at"
    > & { id?: string },
  ): CalendarEvent {
    const now = new Date().toISOString();
    const newEvent: CalendarEvent = {
      ...event,
      id:
        event.id ||
        `guest-event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      user_id: "guest",
      created_at: now,
      updated_at: now,
    };

    if (!this.data.events) this.data.events = [];
    this.data.events = [...this.data.events, newEvent];
    this.saveToStorage();

    const dal = getLocalDal();
    if (dal) {
      try {
        if (dal.calendar.getById(newEvent.id)) {
          dal.calendar.update(newEvent.id, newEvent);
        } else {
          dal.calendar.create(newEvent);
        }
      } catch {}
    }

    return newEvent;
  }

  updateEvent(
    id: string,
    updates: Partial<CalendarEvent>,
  ): CalendarEvent | null {
    const index = this.data.events?.findIndex((e) => e.id === id) ?? -1;
    if (index === -1) return null;

    const updatedEvents = [...this.data.events];
    updatedEvents[index] = {
      ...updatedEvents[index],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.data.events = updatedEvents;

    this.saveToStorage();

    const dal = getLocalDal();
    if (dal) {
      try {
        dal.calendar.update(id, updates);
      } catch {}
    }

    return this.data.events[index];
  }

  deleteEvent(id: string): boolean {
    const index = this.data.events?.findIndex((e) => e.id === id) ?? -1;
    if (index === -1) return false;

    this.data.events = this.data.events.filter((e) => e.id !== id);
    this.unmarkSeedId(id);
    this.saveToStorage();

    const dal = getLocalDal();
    if (dal) {
      try {
        dal.calendar.delete(id);
      } catch {}
    }

    return true;
  }

  // Backup Restore Operations (preserve IDs and timestamps)
  restoreProject(project: Project): void {
    this.data.projects.push(project);
    this.saveToStorage();
  }

  restoreTask(task: Task): void {
    this.data.tasks.push(task);
    this.saveToStorage();
  }

  restoreHabit(habit: Habit): void {
    if (!this.data.habits) this.data.habits = [];
    this.data.habits.push(habit);
    this.saveToStorage();
  }

  restoreEvent(event: CalendarEvent): void {
    if (!this.data.events) this.data.events = [];
    this.data.events.push(event);
    this.saveToStorage();
  }

  restoreFocusLog(log: FocusLog): void {
    if (!this.data.focus_logs) this.data.focus_logs = [];
    this.data.focus_logs.push(log);
    this.saveToStorage();
  }

  restoreBackup(data: BackupPayload): void {
    this.data = {
      tasks: [...(data.tasks || [])],
      projects: [...(data.projects || [])],
      habits: [...(data.habits || [])],
      habit_entries: [...(data.habit_entries || [])],
      focus_logs: [...(data.focus_logs || [])],
      events: [...(data.events || [])],
      lastUpdated: new Date().toISOString(),
    };

    this.saveToStorage();
  }

  addHabitEntry(entry: HabitEntry): void {
    this.addHabitEntries([entry]);
  }

  /** Bulk insert with a single write — imports add thousands of entries. */
  addHabitEntries(entries: HabitEntry[]): void {
    if (entries.length === 0) return;
    if (!this.data.habit_entries) this.data.habit_entries = [];
    this.data.habit_entries = this.data.habit_entries.concat(entries);
    this.saveToStorage();

    const dal = getLocalDal();
    if (dal) {
      try {
        for (const entry of entries) {
          dal.habits.upsertEntry(entry.habit_id, entry.date, entry.value);
        }
      } catch {}
    }
  }

  // Lets telemetry exempt interactions with demo content.
  isSeedId(id: string): boolean {
    return (this.data.seed_ids ?? []).includes(id);
  }

  // True while any Demo item remains. See CONTEXT.md → Guest showcase content
  // → Demo mode.
  isInDemoMode(): boolean {
    return (this.data.seed_ids ?? []).length > 0;
  }

  // Deleting a seeded item should stop counting it toward Demo mode.
  private unmarkSeedId(id: string): void {
    if (!this.data.seed_ids?.includes(id)) return;
    this.data.seed_ids = this.data.seed_ids.filter((seedId) => seedId !== id);
  }

  reset(): void {
    this.clearData();
    this.data = this.getInitialData();
    this.saveToStorage();
    const dal = getLocalDal();
    if (dal) {
      try {
        for (const p of this.data.projects) {
          dal.projects.create({
            id: p.id,
            name: p.name,
            color: p.color,
            view_style: p.view_style,
            is_inbox: p.is_inbox,
            is_archived: p.is_archived,
          });
        }
        for (const t of this.data.tasks) {
          dal.tasks.create({
            id: t.id,
            content: t.content,
            description: t.description,
            priority: t.priority,
            due_date: t.due_date,
            do_date: t.do_date,
            is_evening: t.is_evening,
            is_completed: t.is_completed,
            completed_at: t.completed_at,
            day_order: t.day_order,
            project_id: t.project_id,
            parent_id: t.parent_id,
            recurring_series_id: t.recurring_series_id,
            recurrence: t.recurrence,
          });
        }
        for (const h of this.data.habits) {
          dal.habits.create({
            id: h.id,
            name: h.name,
            description: h.description,
            color: h.color,
            icon: h.icon,
            start_date: h.start_date,
            sort_order: h.sort_order,
            habitType: h.habit_type,
            frequencyCount: h.frequency_count,
            frequencyPeriod: h.frequency_period,
            targetType: h.target_type,
            targetValue: h.target_value,
            unit: h.unit,
          });
        }
        for (const e of this.data.events) {
          dal.calendar.create(e);
        }
      } catch {}
    }
  }

  clearData(): void {
    this.data = {
      tasks: [],
      projects: [],
      habits: [],
      habit_entries: [],
      focus_logs: [],
      events: [],
      lastUpdated: new Date().toISOString(),
    };
    this.saveToStorage();

    const dal = getLocalDal();
    if (dal) {
      try {
        dal.maintenance.clearDomainData();
      } catch (err) {
        console.error("clearData SQLite error:", err);
      }
    }
  }

  clearStorage(): void {
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}

export const mockStore = new MockStore();

// Pure so migration can strip a guest blob before it reaches the singleton. See ADR 0014.
export function stripDemoData(data: GuestData): GuestData {
  const demoIds = new Set(data.seed_ids ?? []);
  if (demoIds.size === 0) return data;

  const tasks = (data.tasks ?? []).filter((t) => !demoIds.has(t.id));
  const habits = (data.habits ?? []).filter((h) => !demoIds.has(h.id));
  const keptTaskIds = new Set(tasks.map((t) => t.id));
  const keptHabitIds = new Set(habits.map((h) => h.id));

  return {
    ...data,
    tasks,
    habits,
    // A demo project still holding the Guest's own task is kept — dropping it would orphan real work.
    projects: (data.projects ?? []).filter(
      (p) => !demoIds.has(p.id) || tasks.some((t) => t.project_id === p.id),
    ),
    events: (data.events ?? []).filter((e) => !demoIds.has(e.id)),
    // Follow the parent, not the id list — else a log could outlive its task and land in real stats.
    habit_entries: (data.habit_entries ?? []).filter((e) =>
      keptHabitIds.has(e.habit_id),
    ),
    focus_logs: (data.focus_logs ?? []).filter(
      (l) => l.task_id === null || keptTaskIds.has(l.task_id),
    ),
    seed_ids: [],
  };
}
