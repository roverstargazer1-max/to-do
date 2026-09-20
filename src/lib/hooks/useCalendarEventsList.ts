"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { calendarClient } from "@/lib/api/calendar-client";
import type { CalendarEvent } from "@/lib/types/calendar-event";

export interface CalendarEventListItem {
  id: string;
  title: string;
  date: string; // ISO start_time
}

interface UseCalendarEventsListOptions {
  enabled?: boolean;
}

/**
 * Shared dedicated `calendar_events` query, consumed by both the calendar
 * (via useCalendarEvents) and the command-menu search. Keeping a single
 * query key means react-query dedupes the fetch across both surfaces.
 */
export function useDedicatedCalendarEventsQuery(enabled = true) {
  return useQuery({
    queryKey: ["calendar-events"],
    queryFn: async (): Promise<CalendarEvent[]> => {
      return calendarClient.list();
    },
    enabled,
  });
}

/**
 * Flat list of dedicated calendar events for content search. Returns only
 * dedicated events ({ id, title, date }) — tasks-with-due-dates are NOT folded
 * in here (that merge lives in useCalendarEvents), so search groups stay disjoint.
 */
export function useCalendarEventsList(
  options: UseCalendarEventsListOptions = {},
): CalendarEventListItem[] {
  const { enabled = true } = options;
  const { data } = useDedicatedCalendarEventsQuery(enabled);

  return useMemo(
    () =>
      (data ?? [])
        .filter((e) => !e.is_archived)
        .map((e) => ({
          id: e.id,
          title: e.title,
          date: e.start_time,
        })),
    [data],
  );
}
