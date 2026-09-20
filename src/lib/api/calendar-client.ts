import type {
  CalendarEvent,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
} from "@/lib/types/calendar-event";
import { getLocalDal } from "@/lib/api/local-dal";

function getBaseUrl(): string {
  if (typeof window !== "undefined") return "";
  return process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";
}

export const calendarClient = {
  async list(
    options: { start?: string; end?: string; userId?: string } = {},
  ): Promise<CalendarEvent[]> {
    const dal = getLocalDal();
    if (dal) return dal.calendar.list(options);
    const params = new URLSearchParams();
    if (options.start) params.set("start", options.start);
    if (options.end) params.set("end", options.end);
    if (options.userId) params.set("userId", options.userId);

    const res = await fetch(
      `${getBaseUrl()}/api/db/calendar-events?${params.toString()}`,
    );
    if (!res.ok)
      throw new Error(`Failed to list calendar events: ${res.statusText}`);
    return res.json();
  },

  async create(
    input: CreateCalendarEventInput & { _clientId?: string },
  ): Promise<CalendarEvent> {
    const dal = getLocalDal();
    if (dal)
      return dal.calendar.create({
        ...input,
        id: input._clientId,
      });
    const res = await fetch(`${getBaseUrl()}/api/db/calendar-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...input,
        id: input._clientId,
      }),
    });
    if (!res.ok)
      throw new Error(`Failed to create calendar event: ${res.statusText}`);
    return res.json();
  },

  async update(
    id: string,
    updates: Partial<UpdateCalendarEventInput>,
  ): Promise<CalendarEvent> {
    const dal = getLocalDal();
    if (dal) {
      const updated = dal.calendar.update(id, updates);
      if (!updated) throw new Error("Calendar event not found");
      return updated;
    }
    const res = await fetch(`${getBaseUrl()}/api/db/calendar-events`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    if (!res.ok)
      throw new Error(`Failed to update calendar event: ${res.statusText}`);
    return res.json();
  },

  async delete(id: string): Promise<boolean> {
    const dal = getLocalDal();
    if (dal) return dal.calendar.delete(id);
    const res = await fetch(
      `${getBaseUrl()}/api/db/calendar-events?id=${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
    );
    if (!res.ok)
      throw new Error(`Failed to delete calendar event: ${res.statusText}`);
    const data = await res.json();
    return Boolean(data.success);
  },
};
