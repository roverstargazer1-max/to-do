import { habitsClient } from "@/lib/api/habits-client";
import type { Habit, HabitEntry } from "@/lib/types/habit";

export interface CreateHabitInput {
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
  sort_order?: number;
}

interface UpdateHabitInput {
  id: string;
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
  habitType?: "boolean" | "measurable";
  frequencyCount?: number;
  frequencyPeriod?: "day" | "week" | "month";
  targetType?: "at_least" | "at_most";
  targetValue?: number;
  unit?: string;
}

interface MarkHabitCompleteInput {
  habitId: string;
  date: string;
  value?: number;
}

export const habitMutations = {
  create: async (input: CreateHabitInput): Promise<Habit> => {
    return habitsClient.create(input);
  },

  update: async (input: UpdateHabitInput): Promise<Habit> => {
    const { id, ...updates } = input;
    const mappedUpdates: Partial<Habit> = {};
    if (updates.name !== undefined) mappedUpdates.name = updates.name;
    if (updates.description !== undefined)
      mappedUpdates.description = updates.description;
    if (updates.color !== undefined) mappedUpdates.color = updates.color;
    if (updates.icon !== undefined) mappedUpdates.icon = updates.icon;
    if (updates.habitType !== undefined)
      mappedUpdates.habit_type = updates.habitType;
    if (updates.frequencyCount !== undefined)
      mappedUpdates.frequency_count = updates.frequencyCount;
    if (updates.frequencyPeriod !== undefined)
      mappedUpdates.frequency_period = updates.frequencyPeriod;
    if (updates.targetType !== undefined)
      mappedUpdates.target_type = updates.targetType;
    if (updates.targetValue !== undefined)
      mappedUpdates.target_value = updates.targetValue;
    if (updates.unit !== undefined) mappedUpdates.unit = updates.unit;

    return habitsClient.update(id, mappedUpdates);
  },

  delete: async (habitId: string): Promise<void> => {
    await habitsClient.delete(habitId);
  },

  reorder: async (
    pairs: { id: string; sort_order: number }[],
  ): Promise<void> => {
    for (const { id, sort_order } of pairs) {
      await habitsClient.update(id, { sort_order });
    }
  },

  markComplete: async (input: MarkHabitCompleteInput): Promise<HabitEntry> => {
    const { habitId, date, value = 1 } = input;
    const res = await habitsClient.recordEntry(habitId, date, value);
    return res.entry;
  },
};
