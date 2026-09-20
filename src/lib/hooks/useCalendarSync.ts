"use client";

import { useCallback } from "react";

/**
 * Calendar sync trigger stub for pure local standalone software.
 */
export function useCalendarSync() {
  const syncNow = useCallback(async () => {}, []);
  return { syncNow };
}
