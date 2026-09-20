import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { getDatabase, closeDatabase } from "@/lib/db/index";
import { HabitRepository } from "@/lib/db/repositories/habit-repository";
import { FocusRepository } from "@/lib/db/repositories/focus-repository";
import { CalendarRepository } from "@/lib/db/repositories/calendar-repository";

describe("02: Habits, Focus Logs & Calendar Events Vertical Slice", () => {
  let tempDir: string;
  let testDbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kagelin-habits-test-"));
    testDbPath = path.join(tempDir, "test.db");
  });

  afterEach(() => {
    closeDatabase();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("handles habit check-ins with strict idempotency", () => {
    const db = getDatabase(testDbPath);
    const habitRepo = new HabitRepository(db);

    const habit = habitRepo.create({
      name: "Morning Meditation",
      color: "#10b981",
    });
    expect(habit.id).toBeDefined();

    const today = new Date().toISOString().split("T")[0];

    // First check-in
    const entry1 = habitRepo.recordEntry(habit.id, today, 1);
    expect(entry1.habit_id).toBe(habit.id);
    expect(entry1.date).toBe(today);
    expect(entry1.value).toBe(1);

    // Repeated check-in on the same day updates rather than duplicate
    const entry2 = habitRepo.recordEntry(habit.id, today, 2);
    expect(entry2.value).toBe(2);

    const fetched = habitRepo.getById(habit.id);
    expect(fetched?.entries.length).toBe(1);
    expect(fetched?.entries[0].value).toBe(2);

    // Uncheck entry
    const deleted = habitRepo.deleteEntry(habit.id, today);
    expect(deleted).toBe(true);

    const refetched = habitRepo.getById(habit.id);
    expect(refetched?.entries.length).toBe(0);
  });

  it("calculates habit streaks accurately across consecutive dates", () => {
    const db = getDatabase(testDbPath);
    const habitRepo = new HabitRepository(db);

    const habit = habitRepo.create({ name: "Daily Exercise" });

    // Set up 3 consecutive days ending today
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const yesterday = new Date(now.getTime() - 86400000);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    const twoDaysAgo = new Date(now.getTime() - 2 * 86400000);
    const twoDaysAgoStr = twoDaysAgo.toISOString().split("T")[0];

    habitRepo.recordEntry(habit.id, twoDaysAgoStr, 1);
    habitRepo.recordEntry(habit.id, yesterdayStr, 1);
    habitRepo.recordEntry(habit.id, todayStr, 1);

    const streak = habitRepo.calculateStreak(habit.id);
    expect(streak.currentStreak).toBe(3);
    expect(streak.longestStreak).toBe(3);
  });

  it("records focus timer sessions and calculates aggregate focus time", () => {
    const db = getDatabase(testDbPath);
    const focusRepo = new FocusRepository(db);

    const log1 = focusRepo.logSession({
      start_time: "2026-09-19T10:00:00.000Z",
      end_time: "2026-09-19T10:25:00.000Z",
      duration_seconds: 1500,
    });
    expect(log1.id).toBeDefined();
    expect(log1.duration_seconds).toBe(1500);

    const log2 = focusRepo.logSession({
      start_time: "2026-09-19T11:00:00.000Z",
      end_time: "2026-09-19T11:50:00.000Z",
      duration_seconds: 3000,
    });
    expect(log2.duration_seconds).toBe(3000);

    const total = focusRepo.getTotalFocusSeconds();
    expect(total).toBe(4500);

    const list = focusRepo.list();
    expect(list.length).toBe(2);
  });

  it("performs full calendar event lifecycle and date-range querying", () => {
    const db = getDatabase(testDbPath);
    const calendarRepo = new CalendarRepository(db);

    const event1 = calendarRepo.create({
      title: "Sprint Planning",
      start_time: "2026-09-20T09:00:00.000Z",
      end_time: "2026-09-20T10:00:00.000Z",
      color: "#6366f1",
    });
    expect(event1.id).toBeDefined();
    expect(event1.title).toBe("Sprint Planning");

    const event2 = calendarRepo.create({
      title: "Quarterly Review",
      start_time: "2026-09-25T14:00:00.000Z",
      end_time: "2026-09-25T15:00:00.000Z",
    });

    // Query range that only encompasses event1
    const filtered = calendarRepo.list({
      start: "2026-09-20T00:00:00.000Z",
      end: "2026-09-20T23:59:59.999Z",
    });
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe(event1.id);

    // Update event
    const updated = calendarRepo.update(event1.id, {
      title: "Updated Sprint Planning",
    });
    expect(updated?.title).toBe("Updated Sprint Planning");

    // Delete event
    const deleted = calendarRepo.delete(event1.id);
    expect(deleted).toBe(true);
    expect(calendarRepo.getById(event1.id)).toBeNull();
  });
});
