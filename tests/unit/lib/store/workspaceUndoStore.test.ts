import { describe, it, expect, vi, beforeEach } from "vitest";
import { useWorkspaceUndoStore } from "@/lib/store/workspaceUndoStore";
import { useUiStore } from "@/lib/store/uiStore";

describe("workspaceUndoStore", () => {
  beforeEach(() => {
    useWorkspaceUndoStore.setState({
      undoStacks: {},
      redoStacks: {},
    });
    useUiStore.setState({
      lastUndoAction: null,
    });
  });

  it("pushes an action and allows undoing it", async () => {
    const undoMock = vi.fn().mockResolvedValue(undefined);
    const redoMock = vi.fn().mockResolvedValue(undefined);

    useWorkspaceUndoStore.getState().pushAction("ws-1", {
      id: "action-1",
      description: "delete node",
      undo: undoMock,
      redo: redoMock,
    });

    expect(useWorkspaceUndoStore.getState().canUndo("ws-1")).toBe(true);
    expect(useWorkspaceUndoStore.getState().canRedo("ws-1")).toBe(false);

    // Also checks that global lastUndoAction is registered
    expect(useUiStore.getState().lastUndoAction).not.toBeNull();

    await useWorkspaceUndoStore.getState().undo("ws-1");

    expect(undoMock).toHaveBeenCalledTimes(1);
    expect(useWorkspaceUndoStore.getState().canUndo("ws-1")).toBe(false);
    expect(useWorkspaceUndoStore.getState().canRedo("ws-1")).toBe(true);
  });

  it("allows redoing an undone action", async () => {
    const undoMock = vi.fn().mockResolvedValue(undefined);
    const redoMock = vi.fn().mockResolvedValue(undefined);

    useWorkspaceUndoStore.getState().pushAction("ws-1", {
      id: "action-1",
      description: "delete node",
      undo: undoMock,
      redo: redoMock,
    });

    await useWorkspaceUndoStore.getState().undo("ws-1");
    expect(undoMock).toHaveBeenCalledTimes(1);

    await useWorkspaceUndoStore.getState().redo("ws-1");
    expect(redoMock).toHaveBeenCalledTimes(1);
    expect(useWorkspaceUndoStore.getState().canUndo("ws-1")).toBe(true);
    expect(useWorkspaceUndoStore.getState().canRedo("ws-1")).toBe(false);
  });

  it("clears redo stack when a new action is pushed", async () => {
    const undo1 = vi.fn().mockResolvedValue(undefined);
    const redo1 = vi.fn().mockResolvedValue(undefined);
    const undo2 = vi.fn().mockResolvedValue(undefined);
    const redo2 = vi.fn().mockResolvedValue(undefined);

    useWorkspaceUndoStore.getState().pushAction("ws-1", {
      id: "action-1",
      description: "op 1",
      undo: undo1,
      redo: redo1,
    });

    await useWorkspaceUndoStore.getState().undo("ws-1");
    expect(useWorkspaceUndoStore.getState().canRedo("ws-1")).toBe(true);

    useWorkspaceUndoStore.getState().pushAction("ws-1", {
      id: "action-2",
      description: "op 2",
      undo: undo2,
      redo: redo2,
    });

    expect(useWorkspaceUndoStore.getState().canRedo("ws-1")).toBe(false);
    expect(useWorkspaceUndoStore.getState().canUndo("ws-1")).toBe(true);
  });

  it("isolates undo/redo stacks between workspaces", async () => {
    const undoA = vi.fn().mockResolvedValue(undefined);
    const redoA = vi.fn().mockResolvedValue(undefined);
    const undoB = vi.fn().mockResolvedValue(undefined);
    const redoB = vi.fn().mockResolvedValue(undefined);

    useWorkspaceUndoStore.getState().pushAction("ws-a", {
      id: "a-1",
      description: "op a",
      undo: undoA,
      redo: redoA,
    });

    useWorkspaceUndoStore.getState().pushAction("ws-b", {
      id: "b-1",
      description: "op b",
      undo: undoB,
      redo: redoB,
    });

    expect(useWorkspaceUndoStore.getState().canUndo("ws-a")).toBe(true);
    expect(useWorkspaceUndoStore.getState().canUndo("ws-b")).toBe(true);

    await useWorkspaceUndoStore.getState().undo("ws-a");
    expect(undoA).toHaveBeenCalledTimes(1);
    expect(undoB).not.toHaveBeenCalled();

    expect(useWorkspaceUndoStore.getState().canUndo("ws-a")).toBe(false);
    expect(useWorkspaceUndoStore.getState().canUndo("ws-b")).toBe(true);
  });

  it("caps undo history to 30 actions", () => {
    for (let i = 0; i < 35; i++) {
      useWorkspaceUndoStore.getState().pushAction("ws-1", {
        id: `act-${i}`,
        description: `act-${i}`,
        undo: vi.fn(),
        redo: vi.fn(),
      });
    }

    const stack = useWorkspaceUndoStore.getState().undoStacks["ws-1"];
    expect(stack.length).toBe(30);
    expect(stack[0].id).toBe("act-5");
    expect(stack[29].id).toBe("act-34");
  });
});
