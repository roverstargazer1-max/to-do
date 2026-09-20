"use client";

import React, { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

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

    function connect() {
      try {
        es = new EventSource("/api/db/live");

        es.addEventListener("change", () => {
          // An external writer touched the database. Mark every query stale so
          // mounted views refetch and inactive ones refresh on their next use.
          void queryClient.invalidateQueries();
        });

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
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (es) es.close();
    };
  }, [queryClient]);

  return <>{children}</>;
}
