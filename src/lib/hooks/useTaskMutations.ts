"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UpdateTaskInput } from "@/lib/types/task";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { handleMutationError } from "@/lib/utils/mutation-error";
import { taskCommands } from "@/lib/commands/task";
import type {
  ToggleTaskInput,
  CreateTaskInputWithClientId,
  DuplicateTaskInput,
} from "@/lib/commands/task";

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["createTask"],
    mutationFn: (newTask: CreateTaskInputWithClientId) =>
      taskCommands.create({ queryClient }, newTask),
    onError: (err) => {
      handleMutationError(err);
    },
  });
}

export function useToggleTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["toggleTask"],
    mutationFn: (input: ToggleTaskInput) =>
      taskCommands.toggle({ queryClient }, input),
    onError: (err) => {
      handleMutationError(err);
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["updateTask"],
    mutationFn: (updates: UpdateTaskInput) =>
      taskCommands.update({ queryClient }, updates),
    onError: (err) => {
      handleMutationError(err);
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  const { trigger } = useHaptic();

  return useMutation({
    mutationKey: ["deleteTask"],
    mutationFn: (id: string) =>
      taskCommands.delete({ queryClient, hapticTrigger: trigger }, id),
    onError: (err) => {
      handleMutationError(err);
    },
  });
}

export function useReorderTasks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["reorderTasks"],
    mutationFn: (pairs: { id: string; day_order: number }[]) =>
      taskCommands.reorder({ queryClient }, pairs),
    onError: (err) => {
      handleMutationError(err);
    },
  });
}

export function useClearCompletedTasks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["clearCompletedTasks"],
    mutationFn: () => taskCommands.clearCompleted({ queryClient }),
    onError: (err) => {
      handleMutationError(err);
    },
  });
}

export function useDuplicateTask() {
  const queryClient = useQueryClient();
  const { trigger } = useHaptic();

  return useMutation({
    mutationKey: ["duplicateTask"],
    mutationFn: ({ sourceTask, overrides }: DuplicateTaskInput) =>
      taskCommands.duplicate(
        { queryClient, hapticTrigger: trigger },
        { sourceTask, overrides },
      ),
    onError: (err) => {
      handleMutationError(err);
    },
  });
}
