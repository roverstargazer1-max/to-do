import { calendarClient } from "@/lib/api/calendar-client";
import type {
  CalendarEvent,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
} from "@/lib/types/calendar-event";

export const calendarEventMutations = {
  create: async (
    input: CreateCalendarEventInput & { _clientId?: string },
  ): Promise<CalendarEvent> => {
    return calendarClient.create(input);
  },

  update: async (input: UpdateCalendarEventInput): Promise<CalendarEvent> => {
    const { id, ...updates } = input;
    return calendarClient.update(id, updates);
  },

  delete: async (id: string): Promise<void> => {
    await calendarClient.delete(id);
  },
};
