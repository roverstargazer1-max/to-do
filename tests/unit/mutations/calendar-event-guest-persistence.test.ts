import { beforeEach, describe, expect, it } from "vitest";
import { mockStore, STORAGE_KEY } from "@/lib/mock/mock-store";
import { calendarEventMutations } from "@/lib/mutations/calendar-event";

describe("calendarEventMutations.create — guest persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    mockStore.reset();
    localStorage.setItem("kanso_guest_mode", "true");
  });

  it("persists an imported event so it survives a reload", async () => {
    await calendarEventMutations.create({
      title: "Imported class",
      description: "From timetable",
      start_time: "2026-09-21T09:00:00.000Z",
      end_time: "2026-09-21T10:00:00.000Z",
      all_day: false,
      metadata: { source: "ics" },
    });

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    expect(saved.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Imported class",
          description: "From timetable",
          start_time: "2026-09-21T09:00:00.000Z",
          metadata: { source: "ics" },
        }),
      ]),
    );
  });
});
