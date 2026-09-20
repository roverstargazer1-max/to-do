import type { Project } from "@/lib/types/task";
import { getLocalDal } from "@/lib/api/local-dal";

function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    return "";
  }
  return process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";
}

export const projectsClient = {
  async list(userId = "local_user"): Promise<Project[]> {
    const dal = getLocalDal();
    if (dal) return dal.projects.list(userId);
    const res = await fetch(
      `${getBaseUrl()}/api/db/projects?userId=${encodeURIComponent(userId)}`,
    );
    if (!res.ok) throw new Error(`Failed to list projects: ${res.statusText}`);
    return res.json();
  },

  async create(input: {
    name: string;
    color?: string;
    view_style?: "list" | "board";
  }): Promise<Project> {
    const dal = getLocalDal();
    if (dal) return dal.projects.create(input);
    const res = await fetch(`${getBaseUrl()}/api/db/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`Failed to create project: ${res.statusText}`);
    return res.json();
  },

  async update(id: string, updates: Partial<Project>): Promise<Project> {
    const dal = getLocalDal();
    if (dal) {
      const updated = dal.projects.update(id, updates);
      if (!updated) throw new Error("Project not found");
      return updated;
    }
    const res = await fetch(`${getBaseUrl()}/api/db/projects`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    if (!res.ok) throw new Error(`Failed to update project: ${res.statusText}`);
    return res.json();
  },

  async delete(id: string): Promise<boolean> {
    const dal = getLocalDal();
    if (dal) return dal.projects.delete(id);
    const res = await fetch(
      `${getBaseUrl()}/api/db/projects?id=${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
    );
    if (!res.ok) throw new Error(`Failed to delete project: ${res.statusText}`);
    const data = await res.json();
    return Boolean(data.success);
  },
};
