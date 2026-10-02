/** All-day events may use the same date for both ends. Timed events need duration. */
export function isValidEventTimeRange(
  start: Date,
  end: Date,
  allDay = false,
): boolean {
  const startTime = start.getTime();
  const endTime = end.getTime();
  return (
    Number.isFinite(startTime) &&
    Number.isFinite(endTime) &&
    (allDay ? endTime >= startTime : endTime > startTime)
  );
}

export class CalendarEventTimeRangeError extends Error {
  constructor() {
    super(
      "Event end must follow its start (all-day events may use the same date)",
    );
    this.name = "CalendarEventTimeRangeError";
  }
}
