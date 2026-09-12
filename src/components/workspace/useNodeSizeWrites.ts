"use client";

import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { nodeCommands } from "@/lib/commands/node";
import { handleMutationError } from "@/lib/utils/mutation-error";
import type { ResizeNodeInput } from "@/lib/types/workspace";

/**
 * Debounce window before persisting a resized node's dimensions.
 */
const NODE_SIZE_DEBOUNCE_MS = 400;

const pendingSizeTimers = new Map<string, ReturnType<typeof setTimeout>>();

function dropPausedSizeWrites(
  queryClient: ReturnType<typeof useQueryClient>,
  nodeId: string,
): void {
  const cache = queryClient.getMutationCache();
  const stale = cache.findAll({
    predicate: (mutation) =>
      Array.isArray(mutation.options.mutationKey) &&
      mutation.options.mutationKey[0] === "node.resize" &&
      (mutation.state.variables as ResizeNodeInput | undefined)?.nodeId ===
        nodeId &&
      mutation.state.isPaused,
  });
  for (const mutation of stale) {
    cache.remove(mutation);
  }
}

/**
 * Layer 3 persistence for node resize: debounced row-level size PATCH.
 */
export function useNodeSizeWrites() {
  const queryClient = useQueryClient();
  const { isGuestMode } = useAuth();

  const mutation = useMutation({
    mutationKey: ["node.resize"],
    mutationFn: (input: ResizeNodeInput) =>
      nodeCommands.resize({ queryClient, isGuestMode }, input),
    onError: (err) => {
      handleMutationError(err);
    },
  });

  const mutateRef = useRef(mutation.mutate);
  useEffect(() => {
    mutateRef.current = mutation.mutate;
  }, [mutation.mutate]);

  const queueSizeWrite = useCallback(
    (input: ResizeNodeInput) => {
      const existing = pendingSizeTimers.get(input.nodeId);
      if (existing) {
        clearTimeout(existing);
      }
      const timer = setTimeout(() => {
        pendingSizeTimers.delete(input.nodeId);
        dropPausedSizeWrites(queryClient, input.nodeId);
        mutateRef.current(input);
      }, NODE_SIZE_DEBOUNCE_MS);
      pendingSizeTimers.set(input.nodeId, timer);
    },
    [queryClient],
  );

  return { queueSizeWrite };
}
