/**
 * Workspace Viewport store (ADR 0018): the canvas's zoom and pan, saved
 * per workspace per device. Device-local by design — never cloud-synced,
 * never part of workspace data — in its own persisted store following the
 * uiStore persist conventions (partialize/version/migrate).
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface WorkspaceViewport {
  x: number;
  y: number;
  zoom: number;
}

interface WorkspaceViewportState {
  viewports: Record<string, WorkspaceViewport>;
  setViewport: (workspaceId: string, viewport: WorkspaceViewport) => void;
  /** Falls back to React Flow's origin viewport when none is saved yet. */
  getViewport: (workspaceId: string) => WorkspaceViewport | undefined;
  forgetWorkspace: (workspaceId: string) => void;
}

export const DEFAULT_VIEWPORT: WorkspaceViewport = { x: 0, y: 0, zoom: 1 };

export const useWorkspaceViewportStore = create<WorkspaceViewportState>()(
  persist(
    (set, get) => ({
      viewports: {},
      setViewport: (workspaceId, viewport) =>
        set((state) => ({
          viewports: { ...state.viewports, [workspaceId]: viewport },
        })),
      getViewport: (workspaceId) => get().viewports[workspaceId],
      forgetWorkspace: (workspaceId) =>
        set((state) => {
          if (!(workspaceId in state.viewports)) return state;
          const { [workspaceId]: _removed, ...rest } = state.viewports;
          return { viewports: rest };
        }),
    }),
    {
      name: "kanso-workspace-viewport",
      // Every field here is device-local persisted state by design;
      // actions are functions, which persist skips automatically.
      version: 1,
    },
  ),
);
