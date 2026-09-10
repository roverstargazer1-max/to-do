"use client";

import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { nodeCommands } from "@/lib/commands/node";
import { handleMutationError } from "@/lib/utils/mutation-error";
import type { MoveNodeInput } from "@/lib/types/workspace";

/**
 * ADR 0018's debounce window — before the mutation, so offline queuing
 * accumulates at most one paused position write per node.
 */
const NODE_MOVE_DEBOUNCE_MS = 400;

/**
 * Timers for pending position writes, one per node — module-level: the
 * write policy belongs to the app, not to one canvas mount, so a pending
 * flush survives unmounting the canvas.
 */
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Drops parked (paused) position writes for a node before queueing a new
 * one: the new write carries the final position, so the stale one is
 * redundant — offline, a node holds at most one queued write (ADR 0018).
 * In-flight writes are left alone: removing them cannot stop the fetch,
 * and positions are absolute, so the latest write to land wins.
 */
function dropPausedPositionWrites(
  queryClient: ReturnType<typeof useQueryClient>,
  nodeId: string,
): void {
  const cache = queryClient.getMutationCache();
  const stale = cache.findAll({
    predicate: (mutation) =>
      Array.isArray(mutation.options.mutationKey) &&
      mutation.options.mutationKey[0] === "node.move" &&
      (mutation.state.variables as MoveNodeInput | undefined)?.nodeId ===
        nodeId &&
      mutation.state.isPaused,
  });
  for (const mutation of stale) {
    cache.remove(mutation);
  }
}

/**
 * Layer 3 of the three-layer drag model (ADR 0018): the debounced
 * row-level position PATCH, executed as the `node.move` mutation — the
 * position-specific key — so an offline write parks in React Query's
 * mutation queue (at most one per node, via the debounce + dedup) and
 * lands on reconnect or reload-resume.
 *
 * Layers 1 (React Flow local state during the drag) and 2 (optimistic
 * `setQueryData` on drag end) live in the canvas; this hook is only the
 * quiet persistence tail.
 */
export function useNodePositionWrites() {
  const queryClient = useQueryClient();
  const { isGuestMode } = useAuth();

  const mutation = useMutation({
    mutationKey: ["node.move"],
    mutationFn: (input: MoveNodeInput) =>
      nodeCommands.move({ queryClient, isGuestMode }, input),
    onError: (err) => {
      handleMutationError(err);
    },
  });

  // The observer's mutate is stable, but keep the latest closure anyway —
  // the flush can fire long after the render that created it.
  const mutateRef = useRef(mutation.mutate);
  useEffect(() => {
    mutateRef.current = mutation.mutate;
  }, [mutation.mutate]);

  /** Queue one node's final position; collapses repeat drag-stops. */
  const queuePositionWrite = useCallback(
    (input: MoveNodeInput) => {
      const existing = pendingTimers.get(input.nodeId);
      if (existing) {
        clearTimeout(existing);
      }
      const timer = setTimeout(() => {
        pendingTimers.delete(input.nodeId);
        dropPausedPositionWrites(queryClient, input.nodeId);
        mutateRef.current(input);
      }, NODE_MOVE_DEBOUNCE_MS);
      pendingTimers.set(input.nodeId, timer);
    },
    [queryClient],
  );

  return { queuePositionWrite };
}
