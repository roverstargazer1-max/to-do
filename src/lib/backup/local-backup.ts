import { tasksClient } from "@/lib/api/tasks-client";
import { projectsClient } from "@/lib/api/projects-client";
import { habitsClient } from "@/lib/api/habits-client";
import { focusClient } from "@/lib/api/focus-client";
import { calendarClient } from "@/lib/api/calendar-client";
import { workspacesClient } from "@/lib/api/workspaces-client";
import { useLocationHistoryStore } from "@/lib/store/locationHistoryStore";
import type { BackupData } from "./types";

export async function collectLocalBackupData(): Promise<BackupData> {
  const [tasks, projects, habits, focusData, events, workspaces] =
    await Promise.all([
      tasksClient.list({ showCompleted: true }),
      projectsClient.list(),
      habitsClient.list(),
      focusClient.list(),
      calendarClient.list(),
      workspacesClient.list(),
    ]);

  const habitEntries = habits.flatMap((h) => h.entries || []);
  const focusLogs = focusData.logs || [];
  const [workspaceNodeLists, workspaceEdgeLists] = await Promise.all([
    Promise.all(workspaces.map((ws) => workspacesClient.listNodes(ws.id))),
    Promise.all(workspaces.map((ws) => workspacesClient.listEdges(ws.id))),
  ]);
  const workspaceNodes = workspaceNodeLists.flat();
  const workspaceEdges = workspaceEdgeLists.flat();

  return {
    metadata: {
      version: 1,
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0",
      exportedAt: new Date().toISOString(),
    },
    tasks,
    projects,
    habits,
    habit_entries: habitEntries,
    focus_logs: focusLogs,
    events,
    location_history: useLocationHistoryStore.getState().locations,
    workspaces,
    workspace_nodes: workspaceNodes,
    workspace_edges: workspaceEdges,
  };
}

export async function restoreLocalBackupData(
  data: BackupData,
  options?: { replace?: boolean; createSnapshot?: boolean },
): Promise<void> {
  const replace = options?.replace ?? true;
  const createSnapshot = options?.createSnapshot ?? true;

  const res = await fetch("/api/db/migrate-legacy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      replace,
      createSnapshot,
      guestData: {
        projects: data.projects,
        tasks: data.tasks,
        habits: data.habits,
        habit_entries: data.habit_entries,
        focus_logs: data.focus_logs,
        events: data.events,
      },
      workspaceData: {
        workspaces: data.workspaces,
        nodes: data.workspace_nodes,
        edges: data.workspace_edges,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to restore backup into SQLite");
  }

  if (data.location_history !== undefined) {
    useLocationHistoryStore.setState({ locations: data.location_history });
  }
}
