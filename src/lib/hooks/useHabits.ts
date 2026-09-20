"use client";

import { useQuery } from "@tanstack/react-query";
import { habitsClient } from "@/lib/api/habits-client";
import type { HabitEntry, HabitWithEntries } from "@/lib/types/habit";

export type { HabitEntry, HabitWithEntries };

interface UseHabitsOptions {
  includeArchived?: boolean;
}

export function useHabits(options: UseHabitsOptions = {}) {
  const { includeArchived = false } = options;

  return useQuery({
    queryKey: ["habits", { includeArchived }],
    staleTime: 60000,
    queryFn: async (): Promise<HabitWithEntries[]> => {
      const habits = await habitsClient.list();
      const filtered = includeArchived
        ? habits
        : habits.filter((h) => !h.archived_at);
      return filtered.sort((a, b) => a.sort_order - b.sort_order);
    },
    placeholderData: (previousData) => previousData,
  });
}

export function useHabit(habitId: string | null) {
  return useQuery({
    queryKey: ["habit", habitId],
    staleTime: 60000,
    queryFn: async (): Promise<HabitWithEntries | null> => {
      if (!habitId) return null;
      const habits = await habitsClient.list();
      return habits.find((h) => h.id === habitId) ?? null;
    },
    enabled: !!habitId,
  });
}
