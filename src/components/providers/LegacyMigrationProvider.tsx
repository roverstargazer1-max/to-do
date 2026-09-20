"use client";

import React, { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { get } from "idb-keyval";
import * as Sentry from "@sentry/nextjs";

export function LegacyMigrationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const MIGRATION_FLAG = "kanso_sqlite_migrated_v1";
    if (localStorage.getItem(MIGRATION_FLAG) === "true") {
      return;
    }

    async function runMigration() {
      try {
        let guestData = null;
        const storedGuest = localStorage.getItem("kanso_guest_data_v11");
        if (storedGuest) {
          try {
            guestData = JSON.parse(storedGuest);
          } catch {}
        }

        let workspaceData = null;
        try {
          workspaceData = await get("kanso-guest-workspaces");
        } catch {}

        const hasGuestData =
          guestData &&
          (guestData.tasks?.length > 0 ||
            guestData.projects?.length > 0 ||
            guestData.habits?.length > 0 ||
            guestData.events?.length > 0);
        const hasWorkspaceData =
          workspaceData &&
          (workspaceData.workspaces?.length > 0 ||
            workspaceData.nodes?.length > 0);

        if (hasGuestData || hasWorkspaceData) {
          const res = await fetch("/api/db/migrate-legacy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              guestData,
              workspaceData,
            }),
          });

          if (res.ok) {
            localStorage.setItem(MIGRATION_FLAG, "true");
            queryClient.invalidateQueries();
          }
        } else {
          // Empty / fresh state, mark flag to avoid checking repeatedly
          localStorage.setItem(MIGRATION_FLAG, "true");
        }
      } catch (e) {
        console.warn("[LegacyMigration] Migration check failed:", e);
        Sentry.captureException(e);
      }
    }

    runMigration();
  }, [queryClient]);

  return <>{children}</>;
}
