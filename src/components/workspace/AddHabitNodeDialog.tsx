"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import { useHabits } from "@/lib/hooks/useHabits";
import { useAuth } from "@/components/AuthProvider";
import { getHabitIcon } from "@/components/habits/shared/HabitIconPicker";
import { Skeleton } from "@/components/ui/skeleton";
import { notify } from "@/lib/notify";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { cn } from "@/lib/utils";
import { getCurrentStreak } from "@/lib/utils/habit-streak";
import { getNodeKindSpec } from "./node-registry";
import type { HabitNodeCommands } from "./node-registry";
import type { NodePosition, WorkspaceNode } from "@/lib/types/workspace";
import type { HabitWithEntries } from "@/lib/types/habit";

interface AddHabitNodeDialogProps {
  workspaceId: string;
  /** Where the new node lands (canvas center at open time). */
  position: NodePosition;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNodeAdded?: (node: WorkspaceNode) => void;
}

/**
 * The "place a habit onto the canvas" picker: lists the same habits the
 * habits page reads, and selecting one routes through the habit kind's
 * registry binding — `node.add` with the reference pair and the registry
 * defaults. The habit itself is never touched; the node is a new
 * reference. Check-in happens on the node through the existing habit
 * mutation hook — the phase-1 asymmetry ADR 0016 documents.
 */
export function AddHabitNodeDialog({
  workspaceId,
  position,
  open,
  onOpenChange,
  onNodeAdded,
}: AddHabitNodeDialogProps) {
  const queryClient = useQueryClient();
  const { isGuestMode } = useAuth();
  const { t } = useTranslation();
  const spec = getNodeKindSpec("habit");
  const { data: habits = [], isLoading } = useHabits();

  const handleSelect = async (habit: HabitWithEntries) => {
    if (!spec) return;
    try {
      const createdNode = await (spec.commands as HabitNodeCommands).add(
        { queryClient, isGuestMode },
        { workspaceId, habitId: habit.id, position },
      );
      notify(t("workspace.addHabit.added"));
      onOpenChange(false);
      if (createdNode) {
        onNodeAdded?.(createdNode);
      }
    } catch (err) {
      console.error("Failed to add habit node:", err);
      notify.error(t("workspace.addHabit.addFailed"));
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[400px] p-0 overflow-hidden">
        <ResponsiveDialogHeader className="px-5 pt-5 pb-3 border-b border-border/40">
          <ResponsiveDialogTitle>
            {t("workspace.addHabit.title")}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t("workspace.addHabit.description")}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="space-y-3 py-4 px-4">
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-10 w-3/4 rounded-md" />
            </div>
          ) : habits.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-[13px] text-muted-foreground">
                {t("workspace.addHabit.emptyTitle")}
              </p>
              <p className="text-[13px] text-muted-foreground mt-1">
                {t("workspace.addHabit.emptyDescription")}
              </p>
            </div>
          ) : (
            <ul>
              {habits.map((habit) => {
                const Icon = getHabitIcon(habit.icon);
                return (
                  <li key={habit.id}>
                    <button
                      type="button"
                      data-testid={`add-habit-option-${habit.id}`}
                      onClick={() => void handleSelect(habit)}
                      className={cn(
                        "w-full flex items-center gap-3 py-3 px-4 text-left",
                        "hover:bg-secondary/40 cursor-pointer transition-colors duration-100",
                      )}
                    >
                      <Icon
                        className="h-4 w-4 shrink-0"
                        strokeWidth={2.25}
                        style={{ color: habit.color }}
                      />
                      <span className="flex-1 text-[15px] font-normal truncate">
                        {habit.name}
                      </span>
                      <span className="text-[11px] text-muted-foreground/80 font-medium tabular-nums shrink-0">
                        {t("workspace.node.streak", {
                          count: getCurrentStreak(habit, habit.entries),
                        })}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
