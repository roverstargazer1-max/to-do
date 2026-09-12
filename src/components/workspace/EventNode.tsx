"use client";

import { useState } from "react";
import { Calendar, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useDedicatedCalendarEventsQuery } from "@/lib/hooks/useCalendarEventsList";
import { useTimeFormat } from "@/lib/hooks/useTimeFormat";
import { useAuth } from "@/components/AuthProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { notify } from "@/lib/notify";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useDateFormatter } from "@/lib/i18n/useDateFormatter";
import { nodeCommands } from "@/lib/commands/node";
import { NodeCard } from "./NodeCard";
import { NodeOrphanBody } from "./NodeOrphanBody";
import type { WorkspaceNodeComponentProps } from "./node-registry";

/**
 * The calendar-event Node — a display-only live reference. The event is
 * read through the dedicated calendar-events query the calendar reads,
 * and the node renders its title and time — an anchor for the
 * arrangement (spec: User Story 9). It deliberately offers no event
 * writes: calendar-event commands are a later tranche, and on Guest,
 * where calendar writes are degraded by existing design, following that
 * degradation means inventing no new guest write behavior — the node is
 * display-only everywhere in phase 1. Removing the node never touches the
 * event itself.
 *
 * An event whose row no longer resolves renders the orphan placeholder
 * (derived at read, ADR 0019) — dismiss (node.remove) is the only
 * affordance.
 */
export function EventNode({ data }: WorkspaceNodeComponentProps) {
  const { row } = data;
  const queryClient = useQueryClient();
  const { isGuestMode } = useAuth();
  const { t } = useTranslation();

  const eventId = row.entity_id;
  const testKey = eventId ?? row.id;
  const { data: events = [], isLoading } = useDedicatedCalendarEventsQuery();
  const event = events.find((e) => e.id === eventId);

  const { formatTime } = useTimeFormat();
  const { formatWeekdayMonthDay } = useDateFormatter();

  const [removing, setRemoving] = useState(false);

  // node.remove — layout only; the referenced event is never touched.
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
      data-testid={`event-node-remove-${testKey}`}
      aria-label={t("workspace.node.removeEventAria")}
      className="nodrag grid h-4 w-4 place-content-center rounded-[3px] text-muted-foreground transition-colors duration-200 ease-seijaku hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      <X className="h-3 w-3" strokeWidth={2.25} />
    </button>
  );

  const stateLabel = event ? "event" : "missing";

  const whenLabel = (start: string, allDay: boolean) => {
    const startDate = new Date(start);
    const dateLabel = formatWeekdayMonthDay(startDate);
    if (allDay) return `${dateLabel} · ${t("workspace.node.allDay")}`;
    return `${dateLabel} · ${formatTime(startDate)}`;
  };

  return (
    <div
      data-testid={`event-node-${testKey}`}
      className="relative w-full h-full"
    >
      <span data-testid={`event-node-state-${testKey}`} className="sr-only">
        {stateLabel}
      </span>

      <NodeCard kind={t("workspace.node.kindEvent")} action={removeButton}>
        {isLoading ? (
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <Skeleton className="h-4 w-4 rounded-[3px]" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ) : event ? (
          <div className="flex items-start gap-2.5 px-3 py-2.5">
            <Calendar
              className="h-4 w-4 mt-0.5 shrink-0"
              strokeWidth={2.25}
              style={{ color: event.color }}
            />
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug break-words text-foreground">
                {event.title}
              </p>
              <p className="text-[11px] text-muted-foreground/80 font-medium uppercase tracking-wider tabular-nums">
                {whenLabel(event.start_time, event.all_day)}
              </p>
            </div>
          </div>
        ) : (
          <NodeOrphanBody lostLabel={t("workspace.canvas.addEvent")} />
        )}
      </NodeCard>
    </div>
  );
}
