import { describe, it, expect } from "vitest";
import { hashKey } from "@tanstack/react-query";
import { taskKeys } from "@/lib/queries/task-keys";

describe("taskKeys", () => {
  it("defaultList is byte-for-byte the pre-command hooks' optimistic target", () => {
    expect(taskKeys.defaultList(false)).toEqual([
      "tasks",
      { projectId: undefined, showCompleted: false, isGuestMode: false },
    ]);
  });

  it("list mirrors the useTasks key shape", () => {
    expect(taskKeys.list({ isGuestMode: true })).toEqual([
      "tasks",
      {
        projectId: undefined,
        showCompleted: false,
        filter: undefined,
        isGuestMode: true,
      },
    ]);
    expect(
      taskKeys.list({
        projectId: "p1",
        showCompleted: true,
        filter: "today",
        isGuestMode: false,
      }),
    ).toEqual([
      "tasks",
      {
        projectId: "p1",
        showCompleted: true,
        filter: "today",
        isGuestMode: false,
      },
    ]);
  });

  it("defaultList resolves to the same cache entry as the useTasks default list", () => {
    // hashKey drops undefined properties, so the commands' optimistic writes
    // land on the exact entry useTasks() reads — the consistency contract
    // the migration must not reshape.
    expect(hashKey(taskKeys.defaultList(true))).toBe(
      hashKey(taskKeys.list({ isGuestMode: true })),
    );
    expect(hashKey(taskKeys.defaultList(false))).toBe(
      hashKey(taskKeys.list({ isGuestMode: false })),
    );
  });

  it("wraps the invalidation prefixes verbatim", () => {
    expect(taskKeys.all).toEqual(["tasks"]);
    expect(taskKeys.subtasks.all).toEqual(["subtasks"]);
    expect(taskKeys.subtasks.of("parent-1")).toEqual(["subtasks", "parent-1"]);
    expect(taskKeys.calendarTasks).toEqual(["calendar-tasks"]);
    expect(taskKeys.statsDashboard).toEqual(["stats-dashboard"]);
    expect(taskKeys.focusTasks).toEqual(["focus-tasks"]);
    expect(taskKeys.taskSeries).toEqual(["task-series"]);
  });
});
