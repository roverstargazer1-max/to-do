import { projectsClient } from "@/lib/api/projects-client";
import { tasksClient } from "@/lib/api/tasks-client";
import type { Project } from "@/lib/types/task";

interface CreateProjectInput {
  name: string;
  color: string;
}

interface UpdateProjectInput {
  id: string;
  name?: string;
  color?: string;
  is_archived?: boolean;
}

export const projectMutations = {
  create: async (input: CreateProjectInput): Promise<Project> => {
    return projectsClient.create(input);
  },

  update: async (input: UpdateProjectInput): Promise<Project> => {
    const { id, ...updates } = input;
    return projectsClient.update(id, updates);
  },

  archive: async (id: string): Promise<Project> => {
    return projectsClient.update(id, { is_archived: true });
  },

  unarchive: async (id: string): Promise<Project> => {
    return projectsClient.update(id, { is_archived: false });
  },

  moveTasksToInbox: async (projectId: string): Promise<void> => {
    const tasks = await tasksClient.list({ projectId, showCompleted: true });
    for (const t of tasks) {
      await tasksClient.update(t.id, { project_id: null });
    }
  },

  deleteProjectTasks: async (projectId: string): Promise<void> => {
    const tasks = await tasksClient.list({ projectId, showCompleted: true });
    for (const t of tasks) {
      await tasksClient.delete(t.id);
    }
  },

  delete: async (id: string): Promise<void> => {
    await projectsClient.delete(id);
  },
};
