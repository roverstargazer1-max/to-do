"use client";

import Link from "next/link";
import { useWorkspaces } from "@/lib/hooks/useWorkspaces";
import { useWorkspaceActions } from "@/components/workspace/WorkspaceActionsProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { Frame, Plus } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useTranslation } from "@/lib/i18n/useTranslation";

export default function WorkspacesPage() {
  const { data: workspaces, isLoading } = useWorkspaces();
  const { openCreateWorkspace } = useWorkspaceActions();
  const { isGuestMode } = useAuth();
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 rounded-full border border-border border-t-foreground animate-spin" />
      </div>
    );
  }

  const hasWorkspaces = (workspaces?.length ?? 0) > 0;

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden scrollbar-hide">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10">
        <div className="flex items-center justify-between gap-4 pb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {t("workspace.list.title")}
            </h1>
            <p className="text-sm text-muted-foreground pt-1">
              {t("workspace.list.description")}
            </p>
          </div>
          <Button
            onClick={() => openCreateWorkspace()}
            variant="outline"
            className="gap-2 shrink-0"
          >
            <Plus className="h-4 w-4" strokeWidth={2.25} />
            <span className="hidden sm:inline">
              {t("workspace.list.newWorkspace")}
            </span>
            <span className="sm:hidden">{t("workspace.list.new")}</span>
          </Button>
        </div>

        {hasWorkspaces ? (
          <ul className="flex flex-col gap-2" data-testid="workspaces-list">
            {workspaces!.map((workspace) => (
              <li key={workspace.id}>
                <Link
                  href={`/workspaces/${workspace.id}`}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-lg border border-border hover:border-foreground/40 transition-colors duration-300 ease-seijaku text-foreground"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
                    <Frame className="h-4 w-4" strokeWidth={2.25} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block truncate font-medium">
                      {workspace.name}
                    </span>
                    <span className="block text-xs text-muted-foreground pt-0.5">
                      {t("workspace.list.openCanvas")}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div>
            <EmptyState
              icon={Frame}
              title={t("workspace.list.emptyTitle")}
              description={t("workspace.list.emptyDescription")}
              action={{
                label: t("workspace.list.createWorkspace"),
                onClick: () => openCreateWorkspace(),
                icon: Plus,
              }}
              className="py-16"
            />
            {/* Ticket 09, user story 26: a registered user who signed up from
                Guest mode finds an empty canvas here — the signup migration
                carries domain data and drops layout (the calendar-events
                precedent). Say so plainly, once, where it's first seen. */}
            {!isGuestMode && (
              <p
                data-testid="signup-layout-note"
                className="pt-2 text-center text-xs text-muted-foreground/80 max-w-md mx-auto"
              >
                {t("workspace.list.signupLayoutNote")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
