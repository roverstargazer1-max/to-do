"use client";

import { useSyncExternalStore } from "react";
import { formatLocalDateKey } from "@/lib/utils/local-date";

function subscribe(callback: () => void) {
  const timer = window.setInterval(callback, 60_000);
  window.addEventListener("focus", callback);
  document.addEventListener("visibilitychange", callback);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("focus", callback);
    document.removeEventListener("visibilitychange", callback);
  };
}

function getSnapshot() {
  return formatLocalDateKey(new Date());
}

function getServerSnapshot() {
  return null;
}

/** Browser-local calendar day, with a matching empty server/hydration snapshot. */
export function useLocalDay() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
