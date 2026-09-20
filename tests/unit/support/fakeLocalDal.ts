import type {
  LocalDal,
  LocalProjectCreateInput,
  LocalProjectUpdateInput,
  LocalTaskCreateInput,
} from "@/lib/api/local-dal";
import type {
  ListTasksOptions,
  Project,
  Task,
  UpdateTaskInput,
} from "@/lib/types/task";

export interface FakeLocalDalStore {
  tasks: Task[];
  projects?: Project[];
}

/**
 * In-memory `tasks`/`projects` slice of the local DAL.
 *
 * The task surfaces used to reach these tests' fixtures through `mockStore`;
 * now that the clients resolve their data through the DAL registry, the same
 * fixtures are driven through the same seam the production code reads.
 */
export function createFakeLocalDal(store: FakeLocalDalStore) {
  const tasks = {
    list: (_options?: ListTasksOptions): Task[] => store.tasks,
    getById: (id: string): Task | null =>
      store.tasks.find((t) => t.id === id) ?? null,
    create: (input: LocalTaskCreateInput): Task => {
      const now = new Date().toISOString();
      const task: Task = {
        id: input.id ?? `fake-task-${store.tasks.length + 1}`,
        user_id: input.user_id ?? "guest",
        project_id: input.project_id ?? null,
        parent_id: input.parent_id ?? null,
        content: input.content,
        description: input.description ?? null,
        priority: input.priority ?? 4,
        due_date: input.due_date ?? null,
        do_date: input.do_date ?? null,
        is_evening: input.is_evening ?? false,
        is_completed: input.is_completed ?? false,
        completed_at: input.completed_at ?? null,
        day_order: input.day_order ?? store.tasks.length,
        recurrence: input.recurrence ?? null,
        recurring_series_id: input.recurring_series_id ?? null,
        google_event_id: input.google_event_id ?? null,
        google_etag: input.google_etag ?? null,
        created_at: input.created_at ?? now,
        updated_at: input.updated_at ?? now,
      };
      store.tasks = [...store.tasks, task];
      return task;
    },
    update: (
      id: string,
      updates: Partial<UpdateTaskInput & Partial<Task>>,
    ): Task | null => {
      if (!store.tasks.some((t) => t.id === id)) return null;
      store.tasks = store.tasks.map((t) =>
        t.id === id
          ? { ...t, ...updates, updated_at: new Date().toISOString() }
          : t,
      );
      return store.tasks.find((t) => t.id === id) ?? null;
    },
    toggleComplete: (id: string): Task | null => {
      const existing = store.tasks.find((t) => t.id === id);
      if (!existing) return null;
      const is_completed = !existing.is_completed;
      store.tasks = store.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              is_completed,
              completed_at: is_completed ? new Date().toISOString() : null,
              updated_at: new Date().toISOString(),
            }
          : t,
      );
      return store.tasks.find((t) => t.id === id) ?? null;
    },
    delete: (id: string): boolean => {
      const before = store.tasks.length;
      store.tasks = store.tasks.filter((t) => t.id !== id);
      return store.tasks.length !== before;
    },
    reorder: (taskIds: string[]): void => {
      const now = new Date().toISOString();
      store.tasks = store.tasks.map((t) => {
        const index = taskIds.indexOf(t.id);
        return index === -1 ? t : { ...t, day_order: index, updated_at: now };
      });
    },
  };

  const projects = {
    list: (_userId?: string): Project[] => store.projects ?? [],
    getById: (id: string): Project | null =>
      (store.projects ?? []).find((p) => p.id === id) ?? null,
    create: (input: LocalProjectCreateInput): Project => {
      const now = new Date().toISOString();
      const project: Project = {
        id: input.id ?? `fake-project-${(store.projects ?? []).length + 1}`,
        user_id: input.user_id ?? "guest",
        name: input.name,
        color: input.color ?? "#6366f1",
        view_style: input.view_style ?? "list",
        is_inbox: input.is_inbox ?? false,
        is_archived: input.is_archived ?? false,
        created_at: input.created_at ?? now,
        updated_at: input.updated_at ?? now,
      };
      store.projects = [...(store.projects ?? []), project];
      return project;
    },
    update: (id: string, updates: LocalProjectUpdateInput): Project | null => {
      const existing = (store.projects ?? []).find((p) => p.id === id);
      if (!existing) return null;
      store.projects = (store.projects ?? []).map((p) =>
        p.id === id
          ? { ...p, ...updates, updated_at: new Date().toISOString() }
          : p,
      );
      return (store.projects ?? []).find((p) => p.id === id) ?? null;
    },
    delete: (id: string): boolean => {
      const before = (store.projects ?? []).length;
      store.projects = (store.projects ?? []).filter((p) => p.id !== id);
      return (store.projects ?? []).length !== before;
    },
  };

  return {
    tasks,
    projects,
  } satisfies Pick<LocalDal, "tasks" | "projects">;
}
