"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import type { Workspace } from "@/lib/types/workspace";

interface WorkspaceActionsContextValue {
  isCreateWorkspaceOpen: boolean;
  openCreateWorkspace: () => void;
  closeCreateWorkspace: () => void;
  activeWorkspace: Workspace | null;
  actionType: "rename" | "delete" | null;
  openRenameWorkspace: (workspace: Workspace) => void;
  openDeleteWorkspace: (workspace: Workspace) => void;
  closeWorkspaceAction: () => void;
}

const WorkspaceActionsContext =
  createContext<WorkspaceActionsContextValue | null>(null);

/**
 * Surfaces the workspace dialog intents to every entry point — sidebar,
 * command palette, canvas header — the ProjectActionsProvider convention:
 * pure state here, dialogs rendered at app level by WorkspaceDialogs.
 */
export function WorkspaceActionsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(
    null,
  );
  const [actionType, setActionType] = useState<"rename" | "delete" | null>(
    null,
  );

  const openCreateWorkspace = React.useCallback(
    () => setIsCreateWorkspaceOpen(true),
    [],
  );
  const closeCreateWorkspace = React.useCallback(
    () => setIsCreateWorkspaceOpen(false),
    [],
  );

  const openRenameWorkspace = React.useCallback((workspace: Workspace) => {
    setActiveWorkspace(workspace);
    setActionType("rename");
  }, []);

  const openDeleteWorkspace = React.useCallback((workspace: Workspace) => {
    setActiveWorkspace(workspace);
    setActionType("delete");
  }, []);

  const closeWorkspaceAction = React.useCallback(() => {
    setActiveWorkspace(null);
    setActionType(null);
  }, []);

  const value = React.useMemo(
    () => ({
      isCreateWorkspaceOpen,
      openCreateWorkspace,
      closeCreateWorkspace,
      activeWorkspace,
      actionType,
      openRenameWorkspace,
      openDeleteWorkspace,
      closeWorkspaceAction,
    }),
    [
      isCreateWorkspaceOpen,
      openCreateWorkspace,
      closeCreateWorkspace,
      activeWorkspace,
      actionType,
      openRenameWorkspace,
      openDeleteWorkspace,
      closeWorkspaceAction,
    ],
  );

  return (
    <WorkspaceActionsContext.Provider value={value}>
      {children}
    </WorkspaceActionsContext.Provider>
  );
}

export function useWorkspaceActions() {
  const context = useContext(WorkspaceActionsContext);
  if (!context) {
    throw new Error(
      "useWorkspaceActions must be used within a WorkspaceActionsProvider",
    );
  }
  return context;
}
