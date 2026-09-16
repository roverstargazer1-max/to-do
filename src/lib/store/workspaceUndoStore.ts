import { create } from "zustand";
import { useUiStore } from "@/lib/store/uiStore";

const MAX_HISTORY = 30;

export interface WorkspaceUndoItem {
  id: string;
  description: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

export interface WorkspaceUndoState {
  undoStacks: Record<string, WorkspaceUndoItem[]>;
  redoStacks: Record<string, WorkspaceUndoItem[]>;

  pushAction: (workspaceId: string, item: WorkspaceUndoItem) => void;
  undo: (workspaceId: string) => Promise<void>;
  redo: (workspaceId: string) => Promise<void>;
  canUndo: (workspaceId: string) => boolean;
  canRedo: (workspaceId: string) => boolean;
  clear: (workspaceId: string) => void;
}

export const useWorkspaceUndoStore = create<WorkspaceUndoState>()(
  (set, get) => ({
    undoStacks: {},
    redoStacks: {},

    pushAction: (workspaceId, item) => {
      const current = get().undoStacks[workspaceId] ?? [];
      const nextUndo = [...current, item].slice(-MAX_HISTORY);

      set((state) => ({
        undoStacks: {
          ...state.undoStacks,
          [workspaceId]: nextUndo,
        },
        redoStacks: {
          ...state.redoStacks,
          [workspaceId]: [],
        },
      }));

      // Register with global lastUndoAction for toast and global shortcut fallback
      useUiStore.getState().setLastUndoAction(async () => {
        await get().undo(workspaceId);
      });
    },

    undo: async (workspaceId) => {
      const currentUndo = get().undoStacks[workspaceId] ?? [];
      if (currentUndo.length === 0) return;

      const item = currentUndo[currentUndo.length - 1];
      const nextUndo = currentUndo.slice(0, -1);

      // Run the undo logic
      await item.undo();

      const currentRedo = get().redoStacks[workspaceId] ?? [];
      const nextRedo = [...currentRedo, item].slice(-MAX_HISTORY);

      set((state) => ({
        undoStacks: {
          ...state.undoStacks,
          [workspaceId]: nextUndo,
        },
        redoStacks: {
          ...state.redoStacks,
          [workspaceId]: nextRedo,
        },
      }));

      // Update global lastUndoAction to previous item or null
      if (nextUndo.length > 0) {
        useUiStore.getState().setLastUndoAction(async () => {
          await get().undo(workspaceId);
        });
      } else {
        useUiStore.getState().setLastUndoAction(null);
      }
    },

    redo: async (workspaceId) => {
      const currentRedo = get().redoStacks[workspaceId] ?? [];
      if (currentRedo.length === 0) return;

      const item = currentRedo[currentRedo.length - 1];
      const nextRedo = currentRedo.slice(0, -1);

      // Run the redo logic
      await item.redo();

      const currentUndo = get().undoStacks[workspaceId] ?? [];
      const nextUndo = [...currentUndo, item].slice(-MAX_HISTORY);

      set((state) => ({
        undoStacks: {
          ...state.undoStacks,
          [workspaceId]: nextUndo,
        },
        redoStacks: {
          ...state.redoStacks,
          [workspaceId]: nextRedo,
        },
      }));

      useUiStore.getState().setLastUndoAction(async () => {
        await get().undo(workspaceId);
      });
    },

    canUndo: (workspaceId) => {
      const stack = get().undoStacks[workspaceId] ?? [];
      return stack.length > 0;
    },

    canRedo: (workspaceId) => {
      const stack = get().redoStacks[workspaceId] ?? [];
      return stack.length > 0;
    },

    clear: (workspaceId) => {
      set((state) => {
        const nextUndo = { ...state.undoStacks };
        const nextRedo = { ...state.redoStacks };
        delete nextUndo[workspaceId];
        delete nextRedo[workspaceId];
        return { undoStacks: nextUndo, redoStacks: nextRedo };
      });
    },
  }),
);

const EMPTY_STACK: WorkspaceUndoItem[] = [];

/**
 * React hook to access undo/redo capabilities for a specific workspace.
 */
export function useWorkspaceUndo(workspaceId: string) {
  const undoStack = useWorkspaceUndoStore(
    (s) => s.undoStacks[workspaceId] ?? EMPTY_STACK,
  );
  const redoStack = useWorkspaceUndoStore(
    (s) => s.redoStacks[workspaceId] ?? EMPTY_STACK,
  );
  const pushAction = useWorkspaceUndoStore((s) => s.pushAction);
  const undo = useWorkspaceUndoStore((s) => s.undo);
  const redo = useWorkspaceUndoStore((s) => s.redo);
  const clear = useWorkspaceUndoStore((s) => s.clear);

  return {
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undoCount: undoStack.length,
    redoCount: redoStack.length,
    pushAction: (item: WorkspaceUndoItem) => pushAction(workspaceId, item),
    undo: () => undo(workspaceId),
    redo: () => redo(workspaceId),
    clear: () => clear(workspaceId),
  };
}
