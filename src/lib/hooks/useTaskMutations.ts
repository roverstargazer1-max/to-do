"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import type { UpdateTaskInput } from "@/lib/types/task";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { handleMutationError } from "@/lib/utils/mutation-error";

import { taskCommands } from "@/lib/commands/task";
import type {
  ToggleTaskInput,
  CreateTaskInputWithClientId,
  DuplicateTaskInput,
} from "@/lib/commands/task";

/**
 * Thin wrappers over the Task Domain Commands (ADR 0016). The whole write
 * policy — mutation-service call, optimistic update, rollback, cache
 * invalidation, and Domain Event publication — lives in the commands; each
 * hook only adapts one command to the React mutation lifecycle (so
 * components keep the pending/success/error/paused API and offline resume
 * via the registered mutationKeys) and surfaces errors as toasts.
 * Component-facing signatures are frozen and unchanged.
 */

export function useCreateTask() {
  const queryClient = useQueryClient();
  const { isGuestMode } = useAuth();

  return useMutation({
    mutationKey: ["createTask"],
    mutationFn: (newTask: CreateTaskInputWithClientId) =>
      taskCommands.create({ queryClient, isGuestMode }, newTask),
    onError: (err) => {
      handleMutationError(err);
    },
  });
}

export function useToggleTask() {
  const queryClient = useQueryClient();
  const { isGuestMode } = useAuth();

  return useMutation({
    mutationKey: ["toggleTask"],
    mutationFn: (input: ToggleTaskInput) =>
      taskCommands.toggle({ queryClient, isGuestMode }, input),
    onError: (err) => {
      handleMutationError(err);
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  const { isGuestMode } = useAuth();

  return useMutation({
    mutationKey: ["updateTask"],
    mutationFn: (updates: UpdateTaskInput) =>
      taskCommands.update({ queryClient, isGuestMode }, updates),
    onError: (err) => {
      handleMutationError(err);
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  const { trigger } = useHaptic();
  const { isGuestMode } = useAuth();

  return useMutation({
    mutationKey: ["deleteTask"],
    mutationFn: (id: string) =>
      taskCommands.delete(
        { queryClient, isGuestMode, hapticTrigger: trigger },
        id,
      ),
    onError: (err) => {
      handleMutationError(err);
    },
  });
}

export function useReorderTasks() {
  const queryClient = useQueryClient();
  const { isGuestMode } = useAuth();

  return useMutation({
    mutationKey: ["reorderTasks"],
    mutationFn: (pairs: { id: string; day_order: number }[]) =>
      taskCommands.reorder({ queryClient, isGuestMode }, pairs),
    onError: (err) => {
      handleMutationError(err);
    },
  });
}

export function useClearCompletedTasks() {
  const queryClient = useQueryClient();
  const { isGuestMode } = useAuth();

  return useMutation({
    mutationKey: ["clearCompletedTasks"],
    mutationFn: () => taskCommands.clearCompleted({ queryClient, isGuestMode }),
    onError: (err) => {
      handleMutationError(err);
    },
  });
}

export function useDuplicateTask() {
  const queryClient = useQueryClient();
  const { trigger } = useHaptic();
  const { isGuestMode } = useAuth();

  return useMutation({
    mutationKey: ["duplicateTask"],
    mutationFn: ({ sourceTask, overrides }: DuplicateTaskInput) =>
      taskCommands.duplicate(
        { queryClient, isGuestMode, hapticTrigger: trigger },
        { sourceTask, overrides },
      ),
    onError: (err) => {
      handleMutationError(err);
    },
  });
}
