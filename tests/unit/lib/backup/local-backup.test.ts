import { beforeEach, describe, expect, it, vi } from "vitest";

const { api, locationState } = vi.hoisted(() => ({
  api: {
    tasksList: vi.fn(),
    projectsList: vi.fn(),
    habitsList: vi.fn(),
    focusList: vi.fn(),
    calendarList: vi.fn(),
    workspacesList: vi.fn(),
    listNodes: vi.fn(),
    listEdges: vi.fn(),
  },
  locationState: {
    locations: ["home", "office"],
    setState: vi.fn(),
  },
}));

vi.mock("@/lib/api/tasks-client", () => ({
  tasksClient: { list: api.tasksList },
}));
vi.mock("@/lib/api/projects-client", () => ({
  projectsClient: { list: api.projectsList },
}));
vi.mock("@/lib/api/habits-client", () => ({
  habitsClient: { list: api.habitsList },
}));
vi.mock("@/lib/api/focus-client", () => ({
  focusClient: { list: api.focusList },
}));
vi.mock("@/lib/api/calendar-client", () => ({
  calendarClient: { list: api.calendarList },
}));
vi.mock("@/lib/api/workspaces-client", () => ({
  workspacesClient: {
    list: api.workspacesList,
    listNodes: api.listNodes,
    listEdges: api.listEdges,
  },
}));
vi.mock("@/lib/store/locationHistoryStore", () => ({
  useLocationHistoryStore: {
    getState: () => locationState,
    setState: locationState.setState,
  },
}));

import {
  collectLocalBackupData,
  restoreLocalBackupData,
} from "@/lib/backup/local-backup";

const workspace = {
  id: "workspace-1",
  user_id: "local_user",
  name: "Planning",
  color: null,
  created_at: "2026-10-02T00:00:00.000Z",
  updated_at: "2026-10-02T00:00:00.000Z",
};

const edge = {
  id: "edge-1",
  workspace_id: workspace.id,
  user_id: "local_user",
  source_node_id: "node-1",
  target_node_id: "node-2",
  created_at: "2026-10-02T00:00:00.000Z",
  updated_at: "2026-10-02T00:00:00.000Z",
};

function configureSuccessfulReads() {
  api.tasksList.mockResolvedValue([{ id: "task-1" }]);
  api.projectsList.mockResolvedValue([{ id: "project-1" }]);
  api.habitsList.mockResolvedValue([{ id: "habit-1", entries: [] }]);
  api.focusList.mockResolvedValue({
    logs: [{ id: "focus-1" }],
    totalSeconds: 3,
  });
  api.calendarList.mockResolvedValue([{ id: "event-1" }]);
  api.workspacesList.mockResolvedValue([workspace]);
  api.listNodes.mockResolvedValue([
    { id: "node-1", workspace_id: workspace.id },
  ]);
  api.listEdges.mockResolvedValue([edge]);
}

describe("local backup collection and restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    locationState.locations = ["home", "office"];
    configureSuccessfulReads();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("rejects when a required domain read fails", async () => {
    api.tasksList.mockRejectedValue(new Error("tasks database unavailable"));

    await expect(collectLocalBackupData()).rejects.toThrow(
      "tasks database unavailable",
    );
  });

  it("rejects when reading a workspace's nodes fails", async () => {
    api.listNodes.mockRejectedValue(new Error("workspace read failed"));

    await expect(collectLocalBackupData()).rejects.toThrow(
      "workspace read failed",
    );
  });

  it("collects all required domain data when reads succeed", async () => {
    const data = await collectLocalBackupData();

    expect(data.tasks).toEqual([{ id: "task-1" }]);
    expect(data.projects).toEqual([{ id: "project-1" }]);
    expect(data.habits).toEqual([{ id: "habit-1", entries: [] }]);
    expect(data.focus_logs).toEqual([{ id: "focus-1" }]);
    expect(data.events).toEqual([{ id: "event-1" }]);
    expect(data.workspaces).toEqual([workspace]);
    expect(data.workspace_nodes).toEqual([
      { id: "node-1", workspace_id: workspace.id },
    ]);
    expect(data.workspace_edges).toEqual([edge]);
    expect(data.location_history).toEqual(["home", "office"]);
  });

  it("restores location history after a successful database restore", async () => {
    const data = await collectLocalBackupData();
    const fetchMock = vi.mocked(fetch);

    await restoreLocalBackupData({
      ...data,
      location_history: ["studio"],
      workspace_edges: [edge],
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(locationState.setState).toHaveBeenCalledWith({
      locations: ["studio"],
    });
    expect(
      JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).workspaceData,
    ).toEqual({
      workspaces: [workspace],
      nodes: [{ id: "node-1", workspace_id: workspace.id }],
      edges: [edge],
    });
  });

  it("does not change location history when the backup omits it", async () => {
    await restoreLocalBackupData({
      metadata: { version: 1, appVersion: "1", exportedAt: "2026-10-02" },
      tasks: [],
      projects: [],
      habits: [],
      habit_entries: [],
      focus_logs: [],
      events: [],
    });

    expect(locationState.setState).not.toHaveBeenCalled();
  });

  it("does not restore location history when the database restore fails", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "restore failed" }),
    } as Response);

    await expect(
      restoreLocalBackupData({
        metadata: { version: 1, appVersion: "1", exportedAt: "2026-10-02" },
        tasks: [],
        projects: [],
        habits: [],
        habit_entries: [],
        focus_logs: [],
        events: [],
        location_history: ["studio"],
      }),
    ).rejects.toThrow("restore failed");

    expect(locationState.setState).not.toHaveBeenCalled();
  });
});
