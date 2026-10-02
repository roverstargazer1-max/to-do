import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NextRequest } from "next/server";
import { closeDatabase } from "@/lib/db/index";
import {
  GET as getHabits,
  POST as postHabits,
} from "@/../app/api/db/habits/route";
import { POST as postHabitEntries } from "@/../app/api/db/habit-entries/route";
import {
  GET as getFocus,
  POST as postFocus,
} from "@/../app/api/db/focus/route";
import {
  GET as getCalendar,
  POST as postCalendar,
  PATCH as patchCalendar,
} from "@/../app/api/db/calendar-events/route";

describe("API Routes: habits, habit-entries, focus, calendar", () => {
  let tempDir: string;
  let testDbPath: string;
  let originalDbPath: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kagelin-api-test2-"));
    testDbPath = path.join(tempDir, "data.db");
    originalDbPath = process.env.KAGELIN_DB_PATH;
    process.env.KAGELIN_DB_PATH = testDbPath;
  });

  afterEach(() => {
    closeDatabase();
    if (originalDbPath) {
      process.env.KAGELIN_DB_PATH = originalDbPath;
    } else {
      delete process.env.KAGELIN_DB_PATH;
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("handles habit and entry lifecycle via API routes", async () => {
    const postReq = new NextRequest("http://localhost:3000/api/db/habits", {
      method: "POST",
      body: JSON.stringify({ name: "Drink Water", color: "#0ea5e9" }),
    });
    const postRes = await postHabits(postReq);
    expect(postRes.status).toBe(201);
    const habit = await postRes.json();

    const entryReq = new NextRequest(
      "http://localhost:3000/api/db/habit-entries",
      {
        method: "POST",
        body: JSON.stringify({ habitId: habit.id, date: "2026-09-19" }),
      },
    );
    const entryRes = await postHabitEntries(entryReq);
    expect(entryRes.status).toBe(201);

    const getReq = new NextRequest("http://localhost:3000/api/db/habits");
    const getRes = await getHabits(getReq);
    expect(getRes.status).toBe(200);
    const list = await getRes.json();
    expect(list.length).toBe(1);
    expect(list[0].entries.length).toBe(1);
  });

  it("handles focus logs and calendar events via API routes", async () => {
    // Focus
    const focusPost = new NextRequest("http://localhost:3000/api/db/focus", {
      method: "POST",
      body: JSON.stringify({
        start_time: "2026-09-19T08:00:00Z",
        end_time: "2026-09-19T08:25:00Z",
        duration_seconds: 1500,
      }),
    });
    const focusRes = await postFocus(focusPost);
    expect(focusRes.status).toBe(201);

    const focusGet = new NextRequest("http://localhost:3000/api/db/focus");
    const focusGetRes = await getFocus(focusGet);
    const focusData = await focusGetRes.json();
    expect(focusData.totalSeconds).toBe(1500);

    // Calendar
    const calPost = new NextRequest(
      "http://localhost:3000/api/db/calendar-events",
      {
        method: "POST",
        body: JSON.stringify({
          title: "Team Standup",
          start_time: "2026-09-19T09:00:00Z",
          end_time: "2026-09-19T09:15:00Z",
        }),
      },
    );
    const calRes = await postCalendar(calPost);
    expect(calRes.status).toBe(201);

    const calGet = new NextRequest(
      "http://localhost:3000/api/db/calendar-events",
    );
    const calGetRes = await getCalendar(calGet);
    const calList = await calGetRes.json();
    expect(calList.length).toBe(1);
  });

  it.each([
    ["reversed", "2026-10-05T23:07:00Z", "2026-10-04T00:07:00Z"],
    ["empty", "2026-10-05T23:07:00Z", "2026-10-05T23:07:00Z"],
    ["invalid", "not-a-date", "2026-10-05T23:07:00Z"],
  ])(
    "rejects a %s timed event range without storing it",
    async (_name, start, end) => {
      const response = await postCalendar(
        new NextRequest("http://localhost:3000/api/db/calendar-events", {
          method: "POST",
          body: JSON.stringify({
            title: "Invalid range",
            start_time: start,
            end_time: end,
          }),
        }),
      );
      expect(response.status).toBe(400);
      const list = await getCalendar(
        new NextRequest("http://localhost:3000/api/db/calendar-events"),
      );
      expect(await list.json()).toEqual([]);
    },
  );

  it("checks a one-sided date edit against the stored end time", async () => {
    const created = await postCalendar(
      new NextRequest("http://localhost:3000/api/db/calendar-events", {
        method: "POST",
        body: JSON.stringify({
          title: "Meeting",
          start_time: "2026-10-02T10:00:00Z",
          end_time: "2026-10-02T11:00:00Z",
        }),
      }),
    );
    const event = await created.json();
    const response = await patchCalendar(
      new NextRequest("http://localhost:3000/api/db/calendar-events", {
        method: "PATCH",
        body: JSON.stringify({
          id: event.id,
          start_time: "2026-10-05T10:00:00Z",
        }),
      }),
    );
    expect(response.status).toBe(400);
    const list = await getCalendar(
      new NextRequest("http://localhost:3000/api/db/calendar-events"),
    );
    expect(await list.json()).toEqual([event]);
  });

  it("accepts a single-day all-day event", async () => {
    const response = await postCalendar(
      new NextRequest("http://localhost:3000/api/db/calendar-events", {
        method: "POST",
        body: JSON.stringify({
          title: "Holiday",
          start_time: "2026-10-02T00:00:00Z",
          end_time: "2026-10-02T00:00:00Z",
          all_day: true,
        }),
      }),
    );
    expect(response.status).toBe(201);
  });
});
