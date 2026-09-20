import type { Habit, HabitWithEntries, HabitEntry } from "@/lib/types/habit";
import { getLocalDal } from "@/lib/api/local-dal";

function getBaseUrl(): string {
  if (typeof window !== "undefined") return "";
  return process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";
}

export const habitsClient = {
  async list(userId = "local_user"): Promise<HabitWithEntries[]> {
    const dal = getLocalDal();
    if (dal) return dal.habits.list(userId);
    const res = await fetch(
      `${getBaseUrl()}/api/db/habits?userId=${encodeURIComponent(userId)}`,
    );
    if (!res.ok) throw new Error(`Failed to list habits: ${res.statusText}`);
    return res.json();
  },

  async create(input: {
    name: string;
    description?: string;
    color?: string;
    icon?: string;
    start_date?: string;
    habitType?: "boolean" | "measurable";
    frequencyCount?: number;
    frequencyPeriod?: "day" | "week" | "month";
    targetType?: "at_least" | "at_most";
    targetValue?: number;
    unit?: string;
    source_uuid?: string;
  }): Promise<Habit> {
    const dal = getLocalDal();
    if (dal) return dal.habits.create(input);
    const res = await fetch(`${getBaseUrl()}/api/db/habits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`Failed to create habit: ${res.statusText}`);
    return res.json();
  },

  async recordEntry(
    habitId: string,
    date: string,
    value = 1,
  ): Promise<{
    entry: HabitEntry;
    streak: { currentStreak: number; longestStreak: number };
  }> {
    const dal = getLocalDal();
    if (dal) {
      const entry = dal.habits.recordEntry(habitId, date, value);
      const streak = dal.habits.calculateStreak(habitId);
      return { entry, streak };
    }
    const res = await fetch(`${getBaseUrl()}/api/db/habit-entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ habitId, date, value }),
    });
    if (!res.ok)
      throw new Error(`Failed to record habit entry: ${res.statusText}`);
    return res.json();
  },

  async deleteEntry(
    habitId: string,
    date: string,
  ): Promise<{
    success: boolean;
    streak: { currentStreak: number; longestStreak: number };
  }> {
    const dal = getLocalDal();
    if (dal) {
      const success = dal.habits.deleteEntry(habitId, date);
      const streak = dal.habits.calculateStreak(habitId);
      return { success, streak };
    }
    const res = await fetch(
      `${getBaseUrl()}/api/db/habit-entries?habitId=${encodeURIComponent(habitId)}&date=${encodeURIComponent(date)}`,
      {
        method: "DELETE",
      },
    );
    if (!res.ok)
      throw new Error(`Failed to delete habit entry: ${res.statusText}`);
    return res.json();
  },

  async update(id: string, updates: Partial<Habit>): Promise<Habit> {
    const dal = getLocalDal();
    if (dal) {
      const updated = dal.habits.update(id, updates);
      if (!updated) throw new Error("Habit not found");
      return updated;
    }
    const res = await fetch(`${getBaseUrl()}/api/db/habits`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    if (!res.ok) throw new Error(`Failed to update habit: ${res.statusText}`);
    return res.json();
  },

  async delete(id: string): Promise<boolean> {
    const dal = getLocalDal();
    if (dal) return dal.habits.delete(id);
    const res = await fetch(
      `${getBaseUrl()}/api/db/habits?id=${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
    );
    if (!res.ok) throw new Error(`Failed to delete habit: ${res.statusText}`);
    const data = await res.json();
    return Boolean(data.success);
  },
};
