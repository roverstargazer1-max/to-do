/**
 * Habit Domain Commands (ADR 0016): write funnel for habit tracking.
 */
import type { QueryClient } from "@tanstack/react-query";
import { habitMutations, type CreateHabitInput } from "@/lib/mutations/habit";
import type { Habit } from "@/lib/types/habit";

export interface HabitCommandContext {
  readonly queryClient: QueryClient;
  readonly isGuestMode: boolean;
}

export const habitCommands = {
  /** `habit.create` — creates a new tracking habit. */
  create: async (
    ctx: HabitCommandContext,
    input: CreateHabitInput,
  ): Promise<Habit> => {
    const habit = await habitMutations.create(input);

    void ctx.queryClient.invalidateQueries({ queryKey: ["habits"] });
    return habit;
  },

  /** Alias for `habit.create` */
  createHabit: (
    ctx: HabitCommandContext,
    input: CreateHabitInput,
  ): Promise<Habit> => habitCommands.create(ctx, input),
};
