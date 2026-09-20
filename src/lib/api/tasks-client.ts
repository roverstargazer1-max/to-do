import type { Task, CreateTaskInput, UpdateTaskInput } from "@/lib/types/task";
import { getLocalDal } from "@/lib/api/local-dal";

function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    return "";
  }
  return process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";
}

export const tasksClient = {
  async list(
    options: {
      projectId?: string | null;
      showCompleted?: boolean;
      filter?: string;
      userId?: string;
    } = {},
  ): Promise<Task[]> {
    const dal = getLocalDal();
    if (dal) return dal.tasks.list(options);
    const params = new URLSearchParams();
    if (options.projectId) params.set("projectId", options.projectId);
    if (options.showCompleted) params.set("showCompleted", "true");
    if (options.filter) params.set("filter", options.filter);
    if (options.userId) params.set("userId", options.userId);

    const res = await fetch(
      `${getBaseUrl()}/api/db/tasks?${params.toString()}`,
    );
    if (!res.ok) throw new Error(`Failed to list tasks: ${res.statusText}`);
    return res.json();
  },

  async create(
    input: CreateTaskInput & {
      id?: string;
      _clientId?: string;
      user_id?: string;
    },
  ): Promise<Task> {
    const id = input.id || input._clientId;
    const dal = getLocalDal();
    if (dal) return dal.tasks.create({ ...input, id });
    const res = await fetch(`${getBaseUrl()}/api/db/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...input,
        id,
      }),
    });
    if (!res.ok) throw new Error(`Failed to create task: ${res.statusText}`);
    return res.json();
  },

  async update(
    id: string,
    updates: Partial<UpdateTaskInput & Partial<Task>>,
  ): Promise<Task> {
    const dal = getLocalDal();
    if (dal) {
      const updated = dal.tasks.update(id, updates);
      if (!updated) throw new Error("Task not found");
      return updated;
    }
    const res = await fetch(`${getBaseUrl()}/api/db/tasks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    if (!res.ok) throw new Error(`Failed to update task: ${res.statusText}`);
    return res.json();
  },

  async toggleComplete(id: string): Promise<Task> {
    const dal = getLocalDal();
    if (dal) {
      const toggled = dal.tasks.toggleComplete(id);
      if (!toggled) throw new Error("Task not found");
      return toggled;
    }
    const res = await fetch(`${getBaseUrl()}/api/db/tasks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "toggleComplete" }),
    });
    if (!res.ok) throw new Error(`Failed to toggle task: ${res.statusText}`);
    return res.json();
  },

  async delete(id: string): Promise<boolean> {
    const dal = getLocalDal();
    if (dal) return dal.tasks.delete(id);
    const res = await fetch(
      `${getBaseUrl()}/api/db/tasks?id=${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
    );
    if (!res.ok) throw new Error(`Failed to delete task: ${res.statusText}`);
    const data = await res.json();
    return Boolean(data.success);
  },

  async reorder(taskIds: string[]): Promise<void> {
    const dal = getLocalDal();
    if (dal) {
      dal.tasks.reorder(taskIds);
      return;
    }
    const res = await fetch(`${getBaseUrl()}/api/db/tasks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reorder", taskIds }),
    });
    if (!res.ok) throw new Error(`Failed to reorder tasks: ${res.statusText}`);
  },
};
