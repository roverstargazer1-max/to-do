"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  useNodesState,
  type OnMoveEnd,
  type OnNodeDrag,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./workspace-canvas.css";
import { Calendar, CheckSquare, Plus, Repeat, Timer } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { notify } from "@/lib/notify";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useWorkspaceNodes } from "@/lib/hooks/useWorkspaceNodes";
import { workspaceKeys } from "@/lib/queries/workspace-keys";
import { useWorkspaceViewportStore } from "@/lib/store/workspaceViewportStore";
import type { NodePosition, WorkspaceNode } from "@/lib/types/workspace";
import {
  getNodeKindSpec,
  toWorkspaceFlowNodes,
  workspaceNodeTypes,
  type FocusNodeCommands,
  type WorkspaceFlowNode,
} from "./node-registry";
import { useNodePositionWrites } from "./useNodePositionWrites";
import { AddTaskNodeDialog } from "./AddTaskNodeDialog";
import { AddHabitNodeDialog } from "./AddHabitNodeDialog";
import { AddEventNodeDialog } from "./AddEventNodeDialog";

interface WorkspaceCanvasProps {
  workspaceId: string;
}

/** Which node-kind picker the Add menu opens. */
type AddNodeDialogKind = "task" | "habit" | "event";

/**
 * The workspace's infinite canvas. Nodes are read through the registry
 * (render routing derives from the single registration) and rendered as
 * live references — the entities behind them are read through their own
 * query families, never copied here.
 *
 * The viewport (zoom/pan) is saved to the device-local viewport store
 * when a gesture ends; remounting on the same device restores it, and
 * switching workspaces swaps canvases because the component is keyed by
 * workspace id.
 *
 * Drag persistence is the three-layer model (ADR 0018): React Flow local
 * state during the drag (instant feedback); on drag end an optimistic
 * write to the node-list cache entry; then a debounced row-level position
 * PATCH under the position-specific `node.move` mutation key — debounce
 * before the mutation, so offline queuing holds at most one position
 * write per node.
 *
 * Skin is ink & matte: workspace-canvas.css (1px borders, no shadows,
 * seijaku easing).
 */
export function WorkspaceCanvas({ workspaceId }: WorkspaceCanvasProps) {
  const savedViewport = useWorkspaceViewportStore((state) =>
    state.getViewport(workspaceId),
  );
  const setViewport = useWorkspaceViewportStore((state) => state.setViewport);

  const queryClient = useQueryClient();
  const { isGuestMode } = useAuth();
  const { t } = useTranslation();
  const { data: workspaceNodes } = useWorkspaceNodes(workspaceId);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkspaceFlowNode>([]);
  const { queuePositionWrite } = useNodePositionWrites();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Query rows → flow nodes via the registry; rebuilds whenever the nodes
  // list refetches (add / remove / invalidation). Drag positions already
  // agree with the optimistic cache write, so nothing visually jumps.
  useEffect(() => {
    setNodes(toWorkspaceFlowNodes(workspaceNodes ?? []));
  }, [workspaceNodes, setNodes]);

  const handleMoveEnd: OnMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      setViewport(workspaceId, {
        x: viewport.x,
        y: viewport.y,
        zoom: viewport.zoom,
      });
    },
    [workspaceId, setViewport],
  );

  // Layer 2 + layer 3 fire together on drag end.
  const handleNodeDragStop: OnNodeDrag<WorkspaceFlowNode> = useCallback(
    (_event, node) => {
      const row = (node.data as { row: WorkspaceNode }).row;
      // A press without movement drags zero pixels — nothing to persist.
      if (
        row.position_x === node.position.x &&
        row.position_y === node.position.y
      ) {
        return;
      }
      // Layer 2 — the optimistic cache write: the node list entry shows
      // the final position immediately.
      queryClient.setQueryData<WorkspaceNode[]>(
        workspaceKeys.nodes.list(workspaceId, isGuestMode),
        (old) =>
          old?.map((n) =>
            n.id === row.id
              ? {
                  ...n,
                  position_x: node.position.x,
                  position_y: node.position.y,
                }
              : n,
          ),
      );
      // Layer 3 — the debounced row-level PATCH under the node.move key.
      queuePositionWrite({
        workspaceId,
        nodeId: row.id,
        position: { x: node.position.x, y: node.position.y },
      });
    },
    [queryClient, workspaceId, isGuestMode, queuePositionWrite],
  );

  // Which node-kind picker is open; the position is computed at open time.
  const [addDialogKind, setAddDialogKind] = useState<AddNodeDialogKind | null>(
    null,
  );
  const [addPosition, setAddPosition] = useState<NodePosition>({
    x: 0,
    y: 0,
  });

  // A new node lands where the user is looking: the canvas center in flow
  // coordinates, derived from the saved viewport (the same source
  // onMoveEnd writes) — no React Flow instance plumbing needed.
  const getCenterPosition = useCallback((): NodePosition => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    const vp = useWorkspaceViewportStore
      .getState()
      .getViewport(workspaceId) ?? { x: 0, y: 0, zoom: 1 };
    const screenX = rect
      ? rect.left + rect.width / 2
      : typeof window === "undefined"
        ? 0
        : window.innerWidth / 2;
    const screenY = rect
      ? rect.top + rect.height / 2
      : typeof window === "undefined"
        ? 0
        : window.innerHeight / 2;
    return {
      x: (screenX - vp.x) / vp.zoom,
      y: (screenY - vp.y) / vp.zoom,
    };
  }, [workspaceId]);

  const openAddDialog = useCallback(
    (kind: AddNodeDialogKind) => {
      setAddPosition(getCenterPosition());
      setAddDialogKind(kind);
    },
    [getCenterPosition],
  );

  // A focus node references the timer singleton, not an entity — there is
  // no picker; the menu item places it directly through the kind's
  // registry binding (ADR 0020).
  const addFocusNode = useCallback(async () => {
    const spec = getNodeKindSpec("focus");
    if (!spec) return;
    try {
      await (spec.commands as FocusNodeCommands).add(
        { queryClient, isGuestMode },
        { workspaceId, position: getCenterPosition() },
      );
      notify(t("workspace.canvas.focusAdded"));
    } catch (err) {
      console.error("Failed to add focus node:", err);
      notify.error(t("workspace.canvas.focusAddFailed"));
    }
  }, [queryClient, isGuestMode, workspaceId, getCenterPosition, t]);

  return (
    <div
      ref={wrapperRef}
      className="relative w-full h-full border-t border-border md:border-t-0"
      data-testid="workspace-canvas"
      data-workspace-id={workspaceId}
    >
      <ReactFlow
        nodes={nodes}
        nodeTypes={workspaceNodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={handleNodeDragStop}
        defaultViewport={savedViewport ?? { x: 0, y: 0, zoom: 1 }}
        onMoveEnd={handleMoveEnd}
        // Canvas is the pan surface; nodes drag (layout writes), but
        // nothing selects and nothing connects (edges are not built).
        elementsSelectable={false}
        nodesConnectable={false}
        nodesDraggable
        deleteKeyCode={null}
        minZoom={0.25}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.5}
          color="var(--border)"
        />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>

      <div className="absolute top-3 right-3 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              data-testid="add-node-menu"
              className="gap-2 bg-background"
            >
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              <span className="hidden sm:inline">
                {t("workspace.canvas.add")}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              data-testid="add-node-task"
              onClick={() => openAddDialog("task")}
              className="gap-2.5"
            >
              <CheckSquare className="h-4 w-4" strokeWidth={2.25} />
              {t("workspace.canvas.addTask")}
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="add-node-habit"
              onClick={() => openAddDialog("habit")}
              className="gap-2.5"
            >
              <Repeat className="h-4 w-4" strokeWidth={2.25} />
              {t("workspace.canvas.addHabit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="add-node-event"
              onClick={() => openAddDialog("event")}
              className="gap-2.5"
            >
              <Calendar className="h-4 w-4" strokeWidth={2.25} />
              {t("workspace.canvas.addEvent")}
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="add-node-focus"
              onClick={() => void addFocusNode()}
              className="gap-2.5"
            >
              <Timer className="h-4 w-4" strokeWidth={2.25} />
              {t("workspace.canvas.addFocus")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AddTaskNodeDialog
        workspaceId={workspaceId}
        position={addPosition}
        open={addDialogKind === "task"}
        onOpenChange={(open) => setAddDialogKind(open ? "task" : null)}
      />
      <AddHabitNodeDialog
        workspaceId={workspaceId}
        position={addPosition}
        open={addDialogKind === "habit"}
        onOpenChange={(open) => setAddDialogKind(open ? "habit" : null)}
      />
      <AddEventNodeDialog
        workspaceId={workspaceId}
        position={addPosition}
        open={addDialogKind === "event"}
        onOpenChange={(open) => setAddDialogKind(open ? "event" : null)}
      />
    </div>
  );
}
