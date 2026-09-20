"use client";

import { useQuery } from "@tanstack/react-query";
import { tasksClient } from "@/lib/api/tasks-client";
import { projectsClient } from "@/lib/api/projects-client";
import { useCalendarStore } from "@/lib/calendar/store";
import { useEffect, useMemo } from "react";
import type { CalendarEventUI } from "@/lib/calendar/types";
import { toCalendarEventUI } from "@/lib/types/calendar-event";
import { useDedicatedCalendarEventsQuery } from "@/lib/hooks/useCalendarEventsList";

export function useCalendarEvents() {
  const setEvents = useCalendarStore((state) => state.setEvents);

  const { data: dedicatedEvents, isLoading: eventsLoading } =
    useDedicatedCalendarEventsQuery();

  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ["calendar-tasks"],
    queryFn: async () => {
      const allTasks = await tasksClient.list({ showCompleted: true });
      const allProjects = await projectsClient.list();
      const projectMap = new Map(allProjects.map((p) => [p.id, p]));

      return allTasks
        .filter((t) => t.due_date)
        .map((t) => ({
          id: t.id,
          content: t.content,
          due_date: t.due_date!,
          project_id: t.project_id,
          projects: t.project_id
            ? {
                color:
                  projectMap.get(t.project_id)?.color || "hsl(var(--primary))",
              }
            : null,
        }));
    },
  });

  const calendarEvents = useMemo(() => {
    const dedicated: CalendarEventUI[] = (dedicatedEvents ?? []).map(
      toCalendarEventUI,
    );

    const taskEvents: CalendarEventUI[] = (tasks ?? []).map((task) => {
      const startDate = new Date(task.due_date);
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      const projectColor = task.projects?.color;

      return {
        id: task.id,
        title: task.content,
        start: startDate,
        end: endDate,
        allDay: false,
        color: projectColor || "hsl(var(--primary))",
        category: "task",
      };
    });

    return [...dedicated, ...taskEvents];
  }, [dedicatedEvents, tasks]);

  useEffect(() => {
    setEvents(calendarEvents);
  }, [calendarEvents, setEvents]);

  return {
    events: calendarEvents,
    isLoading: eventsLoading || tasksLoading,
  };
}
