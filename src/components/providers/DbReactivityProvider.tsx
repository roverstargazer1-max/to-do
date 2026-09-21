"use client";

import React, { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export const REACTIVITY_DEBOUNCE_MS = 150;

export const TARGET_DOMAIN_KEYS = new Set([
  "tasks",
  "projects",
  "habits",
  "calendar-events",
  "workspace",
  "workspaces",
]);

export function isTargetReactivityQueryKey(
  queryKey: readonly unknown[],
): boolean {
  if (!queryKey || queryKey.length === 0) return false;
  const firstKey = queryKey[0];
  return typeof firstKey === "string" && TARGET_DOMAIN_KEYS.has(firstKey);
}

interface DbReactivityProviderProps {
  children: React.ReactNode;
}

export function DbReactivityProvider({ children }: DbReactivityProviderProps) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }

    let es: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let debounceTimer: NodeJS.Timeout | null = null;

    function handleIncomingChange() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        const isHidden = typeof document !== "undefined" && document.hidden;
        void queryClient.invalidateQueries({
          predicate: (query) => isTargetReactivityQueryKey(query.queryKey),
          refetchType: isHidden ? "none" : "active",
        });
        debounceTimer = null;
      }, REACTIVITY_DEBOUNCE_MS);
    }

    function connect() {
      try {
        es = new EventSource("/api/db/live");

        es.addEventListener("change", handleIncomingChange);

        es.onerror = () => {
          if (es) {
            es.close();
            es = null;
          }
          // Retry connection after delay
          reconnectTimeout = setTimeout(connect, 3000);
        };
      } catch {
        reconnectTimeout = setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      if (es) {
        es.close();
        es = null;
      }
    };
  }, [queryClient]);

  return <>{children}</>;
}
