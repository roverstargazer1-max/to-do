"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Check, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useHabits } from "@/lib/hooks/useHabits";
import { useMarkHabitComplete } from "@/lib/hooks/useHabitMutations";
import { getHabitIcon } from "@/components/habits/shared/HabitIconPicker";
import { getCurrentStreak } from "@/lib/utils/habit-streak";
import { useAuth } from "@/components/AuthProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { notify } from "@/lib/notify";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { cn } from "@/lib/utils";
import { nodeCommands } from "@/lib/commands/node";
import { NodeOrphanBody } from "./NodeOrphanBody";
import type { WorkspaceNodeComponentProps } from "./node-registry";

/**
 * The habit Node — a live reference, not a copy. The habit is read through
 * the habits query family the habits page reads, and check-in goes
 * through the existing `useMarkHabitComplete` mutation hook — the same
 * write, same idempotent entry semantics, same streak — the phase-1
 * command-layer asymmetry ADR 0016 documents (habit commands arrive in a
 * later tranche; there is still only one write path). So the node and the
 * habits page always tell the same story (spec: User Stories 8, 30).
 *
 * A habit whose row no longer resolves renders the orphan placeholder
 * (derived at read, ADR 0019) — dismiss (node.remove) is the only
 * affordance; removing the node never touches the habit itself.
 */
export function HabitNode({ data }: WorkspaceNodeComponentProps) {
  const { row } = data;
  const queryClient = useQueryClient();
  const { isGuestMode } = useAuth();
  const { t } = useTranslation();

  const habitId = row.entity_id;
  const testKey = habitId ?? row.id;
  const { data: habits = [], isLoading } = useHabits();
  const habit = habits.find((h) => h.id === habitId);

  const markComplete = useMarkHabitComplete();

  // `today` is fixed for the node's lifetime; a date rollover is picked up
  // on the next list re-render — the habits page rows' convention.
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => format(today, "yyyy-MM-dd"), [today]);
  const doneToday =
    (habit?.entries.find((e) => e.date === todayStr)?.value ?? 0) >= 1;
  const streak = useMemo(
    () => (habit ? getCurrentStreak(habit, habit.entries, today) : 0),
    [habit, today],
  );

  const handleCheckIn = () => {
    if (!habit) return;
    // The same write the habits page performs: value-set semantics on
    // today's entry (1 checks in, 0 un-checks) — idempotent, one write path.
    markComplete.mutate({
      habitId: habit.id,
      date: todayStr,
      value: doneToday ? 0 : 1,
    });
  };

  const [removing, setRemoving] = useState(false);

  // node.remove — layout only; the referenced habit is never touched.
  const handleRemove = async () => {
    setRemoving(true);
    try {
      await nodeCommands.remove({ queryClient, isGuestMode }, row);
    } catch (err) {
      console.error("Failed to remove node:", err);
      notify.error(t("workspace.node.removeFailed"));
    } finally {
      setRemoving(false);
    }
  };

  const removeButton = (
    <button
      type="button"
      onClick={handleRemove}
      disabled={removing}
      data-testid={`habit-node-remove-${testKey}`}
      aria-label={t("workspace.node.removeHabitAria")}
      className="nodrag absolute -top-2 -right-2 h-5 w-5 grid place-content-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors duration-200 ease-seijaku"
    >
      <X className="h-3 w-3" strokeWidth={2.25} />
    </button>
  );

  const stateLabel = habit ? (doneToday ? "done" : "not-done") : "missing";

  return (
    <div
      data-testid={`habit-node-${testKey}`}
      className="relative w-full bg-background"
    >
      <span data-testid={`habit-node-state-${testKey}`} className="sr-only">
        {stateLabel}
      </span>
      {removeButton}

      {isLoading ? (
        <div className="flex items-center gap-2.5 px-3 py-3 w-52">
          <Skeleton className="h-4 w-4 rounded-[3px]" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ) : habit ? (
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <button
            type="button"
            onClick={handleCheckIn}
            disabled={markComplete.isPending}
            data-testid={`habit-node-checkin-${habit.id}`}
            aria-label={t("workspace.node.checkInHabitAria")}
            aria-pressed={doneToday}
            className={cn(
              "nodrag h-4 w-4 shrink-0 grid place-content-center rounded-[3px] border transition-colors duration-200 ease-seijaku",
              doneToday
                ? "border-transparent text-background"
                : "border-foreground/30 text-transparent hover:border-foreground/60",
            )}
            style={doneToday ? { backgroundColor: habit.color } : undefined}
          >
            <Check className="h-3 w-3" strokeWidth={3.5} />
          </button>
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-medium leading-snug break-words text-foreground">
              {(() => {
                const Icon = getHabitIcon(habit.icon);
                return (
                  <Icon
                    className="h-3.5 w-3.5 shrink-0"
                    strokeWidth={2.25}
                    style={{ color: habit.color }}
                  />
                );
              })()}
              <span className="truncate">{habit.name}</span>
            </p>
            <p className="text-[11px] text-muted-foreground/80 font-medium uppercase tracking-wider">
              <span data-testid={`habit-node-today-${habit.id}`}>
                {doneToday
                  ? t("workspace.node.doneToday")
                  : t("workspace.node.today")}
              </span>
              <span className="px-1 text-foreground/25">·</span>
              <span className="tabular-nums text-foreground/70">
                {t("workspace.node.streak", { count: streak })}
              </span>
            </p>
          </div>
        </div>
      ) : (
        <NodeOrphanBody lostLabel={t("workspace.canvas.addHabit")} />
      )}
    </div>
  );
}
