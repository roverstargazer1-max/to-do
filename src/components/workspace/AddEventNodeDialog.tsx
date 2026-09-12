"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Calendar } from "lucide-react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import { useDedicatedCalendarEventsQuery } from "@/lib/hooks/useCalendarEventsList";
import { useTimeFormat } from "@/lib/hooks/useTimeFormat";
import { useAuth } from "@/components/AuthProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { notify } from "@/lib/notify";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useDateFormatter } from "@/lib/i18n/useDateFormatter";
import { cn } from "@/lib/utils";
import { getNodeKindSpec } from "./node-registry";
import type { EventNodeCommands } from "./node-registry";
import type { NodePosition, WorkspaceNode } from "@/lib/types/workspace";
import type { CalendarEvent } from "@/lib/types/calendar-event";

interface AddEventNodeDialogProps {
  workspaceId: string;
  /** Where the new node lands (canvas center at open time). */
  position: NodePosition;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNodeAdded?: (node: WorkspaceNode) => void;
}

/**
 * The "place a calendar event onto the canvas" picker: lists the same
 * events the calendar reads (the dedicated calendar-events query), and
 * selecting one routes through the event kind's registry binding —
 * `node.add` with the reference pair and the registry defaults. The
 * event itself is never touched; the node is a new, display-only
 * reference.
 */
export function AddEventNodeDialog({
  workspaceId,
  position,
  open,
  onOpenChange,
  onNodeAdded,
}: AddEventNodeDialogProps) {
  const queryClient = useQueryClient();
  const { isGuestMode } = useAuth();
  const { t } = useTranslation();
  const spec = getNodeKindSpec("event");
  const { data: events = [], isLoading } = useDedicatedCalendarEventsQuery();
  const { formatTime } = useTimeFormat();
  const { formatMonthDay } = useDateFormatter();

  const handleSelect = async (event: CalendarEvent) => {
    if (!spec) return;
    try {
      const createdNode = await (spec.commands as EventNodeCommands).add(
        { queryClient, isGuestMode },
        { workspaceId, eventId: event.id, position },
      );
      notify(t("workspace.addEvent.added"));
      onOpenChange(false);
      if (createdNode) {
        onNodeAdded?.(createdNode);
      }
    } catch (err) {
      console.error("Failed to add event node:", err);
      notify.error(t("workspace.addEvent.addFailed"));
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[400px] p-0 overflow-hidden">
        <ResponsiveDialogHeader className="px-5 pt-5 pb-3 border-b border-border/40">
          <ResponsiveDialogTitle>
            {t("workspace.addEvent.title")}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t("workspace.addEvent.description")}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="space-y-3 py-4 px-4">
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-10 w-3/4 rounded-md" />
            </div>
          ) : events.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-[13px] text-muted-foreground">
                {t("workspace.addEvent.emptyTitle")}
              </p>
              <p className="text-[13px] text-muted-foreground mt-1">
                {t("workspace.addEvent.emptyDescription")}
              </p>
            </div>
          ) : (
            <ul>
              {events.map((event) => {
                const startDate = new Date(event.start_time);
                return (
                  <li key={event.id}>
                    <button
                      type="button"
                      data-testid={`add-event-option-${event.id}`}
                      onClick={() => void handleSelect(event)}
                      className={cn(
                        "w-full flex items-center gap-3 py-3 px-4 text-left",
                        "hover:bg-secondary/40 cursor-pointer transition-colors duration-100",
                      )}
                    >
                      <Calendar
                        className="h-4 w-4 shrink-0"
                        strokeWidth={2.25}
                        style={{ color: event.color }}
                      />
                      <span className="flex-1 text-[15px] font-normal truncate">
                        {event.title}
                      </span>
                      <span className="text-[11px] text-muted-foreground/80 font-medium uppercase tracking-wider tabular-nums shrink-0">
                        {event.all_day
                          ? `${formatMonthDay(startDate)} · ${t("workspace.node.allDay")}`
                          : `${formatMonthDay(startDate)} · ${formatTime(startDate)}`}
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
