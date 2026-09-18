"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  useNodesState,
  type Connection,
  type NodeChange,
  type OnNodesChange,
  type OnConnect,
  type OnConnectStart,
  type OnConnectEnd,
  type OnEdgesChange,
  type OnMoveEnd,
  type OnNodeDrag,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./workspace-canvas.css";
import {
  Calendar,
  CheckSquare,
  FileText,
  GitBranch,
  Group,
  Plus,
  Repeat,
  Timer,
  Undo2,
  Redo2,
  Ungroup,
  Workflow,
  Image as ImageIcon,
  Link2,
} from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
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
import type { TranslationKey } from "@/lib/i18n/dictionaries/en";
import { useWorkspaceNodes } from "@/lib/hooks/useWorkspaceNodes";
import { useWorkspaceEdges } from "@/lib/hooks/useWorkspaceEdges";
import { workspaceKeys } from "@/lib/queries/workspace-keys";
import { useWorkspaceViewportStore } from "@/lib/store/workspaceViewportStore";
import {
  useWorkspaceUndo,
  useWorkspaceUndoStore,
} from "@/lib/store/workspaceUndoStore";
import { getPlatformKey } from "@/lib/utils/platform";
import { edgeCommands } from "@/lib/commands/edge";
import { nodeCommands } from "@/lib/commands/node";
import type {
  NodePosition,
  WorkspaceEdge,
  WorkspaceNode,
} from "@/lib/types/workspace";
import {
  getNodeKindSpec,
  toWorkspaceFlowNodes,
  workspaceNodeTypes,
  type FocusNodeCommands,
  type DocNodeCommands,
  type DecisionNodeCommands,
  type StepNodeCommands,
  type TaskNodeCommands,
  type WorkspaceFlowNode,
} from "./node-registry";
import {
  toWorkspaceFlowEdges,
  type WorkspaceFlowEdge,
} from "./edge-projection";
import { workspaceEdgeTypes } from "./WorkspaceEdge";
import { useNodePositionWrites } from "./useNodePositionWrites";
import { useNodeSizeWrites } from "./useNodeSizeWrites";
import { AddTaskNodeDialog } from "./AddTaskNodeDialog";
import { AddProjectNodeDialog } from "./AddProjectNodeDialog";
import { AddHabitNodeDialog } from "./AddHabitNodeDialog";
import { AddEventNodeDialog } from "./AddEventNodeDialog";
import { QuickAddMenu } from "./QuickAddMenu";
import { taskCommands } from "@/lib/commands/task";
import { visualCommands } from "@/lib/commands/visual";
import { useTasks } from "@/lib/hooks/useTasks";
import type { Task } from "@/lib/types/task";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { TaskDetailPanel } from "@/components/tasks/TaskDetailPanel";
import { VisualRelationsPanel } from "./VisualRelationsPanel";
import { GuestAssetBridgeButton } from "./GuestAssetBridgeButton";

interface WorkspaceCanvasProps {
  workspaceId: string;
}

/** Which node-kind picker the Add menu opens. */
type AddNodeDialogKind = "task" | "habit" | "event" | "project";

/**
 * The workspace's infinite canvas. Nodes are read through the registry
 * (render routing derives from the single registration) and rendered as
 * live references — the entities behind them are read through their own
 * query families, never copied here.
 *
 * The arrangement is two layers. **Nodes** are placed references, authored
 * by drag. **Edges** are the connections between them (ADR 0021): a purely
 * visual relationship, drawn from a card's right-hand port into another
 * card's left-hand one and cut with the Delete key. Both are layout, both
 * are persisted, neither carries a runtime — a connection says "these two
 * belong together", nothing more.
 *
 * The viewport (zoom/pan) is saved to the device-local viewport store
 * when a gesture ends; remounting on the same device restores it, and
 * switching workspaces swaps canvases because the component is keyed by
 * workspace id.
 *
 * Drag persistence is the three-layer model (ADR 0018): React Flow local
 * state during the drag (instant feedback); on drag end an optimistic
 * write to the node-list cache entry; then a debounced row-level position
 * PATCH under the position-specific `node.move` mutation key. Drawing a
 * connection follows the same shape — the line is drawn the instant the
 * user lets go (local state, with its id minted up front so the persisted
 * row is the same row), the write lands through `edge.add`, and the moment
 * the rows carry it the drawn copy retires; cutting one drops it from the
 * cache immediately and then persists that.
 *
 * Skin is ink & matte: workspace-canvas.css (1px borders, no shadows,
 * seijaku easing) — node cards on a stepped-back sheet, so a node reads as
 * a card rather than as text floating on the page.
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
  const { data: workspaceEdges } = useWorkspaceEdges(workspaceId);
  const { canUndo, canRedo, undo, redo } = useWorkspaceUndo(workspaceId);
  const platformKey = useMemo(() => getPlatformKey(), []);
  const isMac = platformKey === "⌘";
  const [visualRelationsOpen, setVisualRelationsOpen] = useState(false);

  useHotkeys(
    "mod+z",
    (event) => {
      event.preventDefault();
      void undo();
    },
    { enableOnFormTags: false, preventDefault: true },
  );

  useHotkeys(
    ["mod+y", "mod+shift+z", "shift+mod+z"],
    (event) => {
      event.preventDefault();
      void redo();
    },
    { enableOnFormTags: false, preventDefault: true },
  );

  const { data: tasks = [] } = useTasks({ showCompleted: true });
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const editingTask = useMemo(
    () =>
      editingTaskId
        ? (tasks.find((t) => t.id === editingTaskId) ?? null)
        : null,
    [editingTaskId, tasks],
  );
  const [preservedEditingTask, setPreservedEditingTask] = useState<Task | null>(
    null,
  );
  useEffect(() => {
    if (editingTask) {
      setPreservedEditingTask(editingTask);
    }
  }, [editingTask]);
  const activeTaskForPanel = editingTask ?? preservedEditingTask;

  useEffect(() => {
    const handleOpenTaskDetail = (event: Event) => {
      const customEvent = event as CustomEvent<{ taskId?: string }>;
      if (customEvent.detail?.taskId) {
        setEditingTaskId(customEvent.detail.taskId);
      }
    };

    window.addEventListener("workspace:open-task-detail", handleOpenTaskDetail);
    return () => {
      window.removeEventListener(
        "workspace:open-task-detail",
        handleOpenTaskDetail,
      );
    };
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState<WorkspaceFlowNode>([]);
  const [edges, setEdges] = useState<WorkspaceFlowEdge[]>([]);
  const { queuePositionWrite } = useNodePositionWrites();
  const { queueSizeWrite } = useNodeSizeWrites();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const reactFlowInstanceRef = useRef<ReactFlowInstance<
    WorkspaceFlowNode,
    WorkspaceFlowEdge
  > | null>(null);
  const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(
    null,
  );
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [quickMenuAnchor, setQuickMenuAnchor] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [pendingSourceNodeId, setPendingSourceNodeId] = useState<string | null>(
    null,
  );
  const connectStartRef = useRef<{
    nodeId: string | null;
    handleType: string | null;
  } | null>(null);

  // The pre-change nodes, for handlers that need the post-change frame
  const nodesRef = useRef<WorkspaceFlowNode[]>([]);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const displayNodes = useMemo(() => {
    if (!dropTargetGroupId) return nodes;
    return nodes.map((node) =>
      node.id === dropTargetGroupId
        ? {
            ...node,
            data: {
              ...node.data,
              isDropTarget: true,
            },
          }
        : node,
    );
  }, [nodes, dropTargetGroupId]);

  // Connections the user has drawn that the rows do not carry yet. Kept in
  // a ref because the projection effect reads it without re-subscribing.
  const pendingEdgeIdsRef = useRef<Set<string>>(new Set());

  // Node IDs currently undergoing deletion; prevents onEdgesDelete from registering
  // duplicate edge-only undo items for incident edges managed by nodeCommands.
  const deletingNodeIdsRef = useRef<Set<string>>(new Set());

  const handleUpdateEdgeLabel = useCallback(
    (edgeId: string, label: string) => {
      const trimmed = label.trim();
      const finalLabel = trimmed === "" ? null : trimmed;

      queryClient.setQueryData<WorkspaceEdge[]>(
        workspaceKeys.edges.list(workspaceId, isGuestMode),
        (old) =>
          old?.map((row) =>
            row.id === edgeId ? { ...row, label: finalLabel } : row,
          ),
      );

      setEdges((current) =>
        current.map((edge) => {
          if (edge.id !== edgeId || !edge.data) return edge;
          return {
            ...edge,
            data: {
              ...edge.data,
              edgeId: edge.data.edgeId,
              workspaceId: edge.data.workspaceId,
              label: finalLabel,
            },
          };
        }),
      );

      void edgeCommands
        .update(
          { queryClient, isGuestMode },
          { id: edgeId, workspaceId, label: finalLabel },
        )
        .catch((err) => {
          console.error("Failed to update edge label:", err);
          notify.error(t("workspace.canvas.updateEdgeLabelFailed"));
        });
    },
    [queryClient, isGuestMode, workspaceId, t],
  );

  // Query rows → flow nodes and flow edges via the registry and the edge
  // projection; rebuilds whenever either list refetches (add / remove /
  // connect / invalidation). Drag positions and freshly drawn lines
  // already agree with what the user sees, so nothing visually jumps.
  useEffect(() => {
    const flowNodes = toWorkspaceFlowNodes(workspaceNodes ?? []);
    setNodes(flowNodes);

    const persisted = toWorkspaceFlowEdges(
      workspaceEdges ?? [],
      flowNodes.map((node) => node.id),
      {
        onUpdateLabel: handleUpdateEdgeLabel,
        nodes: flowNodes,
      },
    );
    const persistedIds = new Set(persisted.map((edge) => edge.id));
    // A drawn connection retires the moment its row lands.
    for (const id of persistedIds) pendingEdgeIdsRef.current.delete(id);

    setEdges((current) => [
      ...persisted,
      // Still in flight: keep it drawn, or a concurrent nodes refetch would
      // blink the line away for a frame.
      ...current.filter(
        (edge) =>
          pendingEdgeIdsRef.current.has(edge.id) && !persistedIds.has(edge.id),
      ),
    ]);
  }, [workspaceNodes, workspaceEdges, setNodes, handleUpdateEdgeLabel]);

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

  const handleNodeDrag: OnNodeDrag<WorkspaceFlowNode> = useCallback(
    (_event, node, movedNodes) => {
      const moved =
        Array.isArray(movedNodes) && movedNodes.length > 0
          ? movedNodes
          : [node];
      const hasGroup = moved.some(
        (n) => (n.data as { row: WorkspaceNode }).row.kind === "group",
      );
      if (hasGroup) {
        setDropTargetGroupId((prev) => (prev ? null : prev));
        return;
      }

      const currentNodes = nodesRef.current;
      const groupNodes = currentNodes.filter(
        (n) => (n.data as { row: WorkspaceNode }).row.kind === "group",
      );

      const parent = node.parentId
        ? currentNodes.find((n) => n.id === node.parentId)
        : null;
      const parentX = parent?.position.x ?? 0;
      const parentY = parent?.position.y ?? 0;
      const absX = parentX + node.position.x;
      const absY = parentY + node.position.y;
      const w = node.measured?.width ?? (node.style?.width as number) ?? 260;
      const h = node.measured?.height ?? (node.style?.height as number) ?? 80;
      const centerX = absX + w / 2;
      const centerY = absY + h / 2;

      let targetGroup: WorkspaceFlowNode | null = null;
      for (const g of groupNodes) {
        const gx = g.position.x;
        const gy = g.position.y;
        const gw = (g.style?.width as number) ?? g.measured?.width ?? 360;
        const gh = (g.style?.height as number) ?? g.measured?.height ?? 240;

        if (
          centerX >= gx &&
          centerX <= gx + gw &&
          centerY >= gy &&
          centerY <= gy + gh
        ) {
          targetGroup = g;
          break;
        }
      }

      const newTargetId =
        targetGroup && targetGroup.id !== node.parentId ? targetGroup.id : null;
      setDropTargetGroupId((prev) =>
        prev !== newTargetId ? newTargetId : prev,
      );
    },
    [],
  );

  // Layer 2 + layer 3 fire together on drag end.
  const handleNodeDragStop: OnNodeDrag<WorkspaceFlowNode> = useCallback(
    async (_event, node, movedNodes) => {
      setDropTargetGroupId(null);
      const moved =
        Array.isArray(movedNodes) && movedNodes.length > 0
          ? movedNodes
          : [node];
      const currentNodes = nodesRef.current;
      const groupNodes = currentNodes.filter(
        (n) => (n.data as { row: WorkspaceNode }).row.kind === "group",
      );

      for (const dragged of moved) {
        const row = (dragged.data as { row: WorkspaceNode }).row;
        // Group container nodes persist their own position directly
        if (row.kind === "group") {
          const pos = dragged.position;
          if (row.position_x === pos.x && row.position_y === pos.y) continue;
          queryClient.setQueryData<WorkspaceNode[]>(
            workspaceKeys.nodes.list(workspaceId, isGuestMode),
            (old) =>
              old?.map((n) =>
                n.id === row.id
                  ? { ...n, position_x: pos.x, position_y: pos.y }
                  : n,
              ),
          );
          queuePositionWrite({ workspaceId, nodeId: row.id, position: pos });
          continue;
        }

        // Card node — calculate absolute coordinates and center point
        const parent = dragged.parentId
          ? currentNodes.find((n) => n.id === dragged.parentId)
          : null;
        const parentX = parent?.position.x ?? 0;
        const parentY = parent?.position.y ?? 0;
        const absX = parentX + dragged.position.x;
        const absY = parentY + dragged.position.y;
        const w =
          dragged.measured?.width ?? (dragged.style?.width as number) ?? 260;
        const h =
          dragged.measured?.height ?? (dragged.style?.height as number) ?? 80;
        const centerX = absX + w / 2;
        const centerY = absY + h / 2;

        let targetGroup: WorkspaceFlowNode | null = null;
        for (const g of groupNodes) {
          const gx = g.position.x;
          const gy = g.position.y;
          const gw = (g.style?.width as number) ?? g.measured?.width ?? 360;
          const gh = (g.style?.height as number) ?? g.measured?.height ?? 240;

          if (
            centerX >= gx &&
            centerX <= gx + gw &&
            centerY >= gy &&
            centerY <= gy + gh
          ) {
            targetGroup = g;
            break;
          }
        }

        const currentGroupId = row.group_id ?? null;
        const targetGroupId = targetGroup ? targetGroup.id : null;

        if (currentGroupId && !targetGroupId) {
          // Detach from current group -> becomes root node
          const newPos = { x: Math.round(absX), y: Math.round(absY) };
          setNodes((nds) =>
            nds.map((n) =>
              n.id === row.id
                ? { ...n, parentId: undefined, position: newPos }
                : n,
            ),
          );
          await nodeCommands.removeFromGroup(
            { queryClient, isGuestMode },
            { workspaceId, nodeId: row.id, position: newPos },
          );
        } else if (targetGroupId && targetGroupId !== currentGroupId) {
          // Attach into new group
          const gx = targetGroup!.position.x;
          const gy = targetGroup!.position.y;
          const relPos = {
            x: Math.round(absX - gx),
            y: Math.round(absY - gy),
          };

          // Auto-expand target group if card extends beyond bottom-right
          const gw =
            (targetGroup!.style?.width as number) ??
            targetGroup!.measured?.width ??
            360;
          const gh =
            (targetGroup!.style?.height as number) ??
            targetGroup!.measured?.height ??
            240;
          const requiredW = relPos.x + w + 24;
          const requiredH = relPos.y + h + 24;
          if (requiredW > gw || requiredH > gh) {
            const newGw = Math.max(gw, requiredW);
            const newGh = Math.max(gh, requiredH);
            queueSizeWrite({
              workspaceId,
              nodeId: targetGroupId,
              width: newGw,
              height: newGh,
            });
            queryClient.setQueryData<WorkspaceNode[]>(
              workspaceKeys.nodes.list(workspaceId, isGuestMode),
              (old) =>
                old?.map((n) =>
                  n.id === targetGroupId
                    ? { ...n, width: newGw, height: newGh }
                    : n,
                ),
            );
          }

          setNodes((nds) =>
            nds.map((n) =>
              n.id === row.id
                ? { ...n, parentId: targetGroupId, position: relPos }
                : n,
            ),
          );

          await nodeCommands.addToGroup(
            { queryClient, isGuestMode },
            {
              workspaceId,
              nodeId: row.id,
              groupId: targetGroupId,
              position: relPos,
            },
          );
        } else {
          // Moved within same container or canvas root
          const pos = dragged.position;
          if (row.position_x === pos.x && row.position_y === pos.y) continue;

          if (currentGroupId && targetGroup) {
            const gw =
              (targetGroup.style?.width as number) ??
              targetGroup.measured?.width ??
              360;
            const gh =
              (targetGroup.style?.height as number) ??
              targetGroup.measured?.height ??
              240;
            const requiredW = pos.x + w + 24;
            const requiredH = pos.y + h + 24;
            if (requiredW > gw || requiredH > gh) {
              const newGw = Math.max(gw, requiredW);
              const newGh = Math.max(gh, requiredH);
              queueSizeWrite({
                workspaceId,
                nodeId: currentGroupId,
                width: newGw,
                height: newGh,
              });
              queryClient.setQueryData<WorkspaceNode[]>(
                workspaceKeys.nodes.list(workspaceId, isGuestMode),
                (old) =>
                  old?.map((n) =>
                    n.id === currentGroupId
                      ? { ...n, width: newGw, height: newGh }
                      : n,
                  ),
              );
            }
          }

          queryClient.setQueryData<WorkspaceNode[]>(
            workspaceKeys.nodes.list(workspaceId, isGuestMode),
            (old) =>
              old?.map((n) =>
                n.id === row.id
                  ? { ...n, position_x: pos.x, position_y: pos.y }
                  : n,
              ),
          );
          queuePositionWrite({ workspaceId, nodeId: row.id, position: pos });
        }
      }
    },
    [
      queryClient,
      workspaceId,
      isGuestMode,
      queuePositionWrite,
      queueSizeWrite,
      setNodes,
    ],
  );

  /**
   * Layer 2 + layer 3 for resize and boundary expansion (expandParent).
   */
  const handleNodesChange: OnNodesChange<WorkspaceFlowNode> = useCallback(
    (changes: NodeChange<WorkspaceFlowNode>[]) => {
      onNodesChange(changes);

      for (const change of changes) {
        if (change.type !== "dimensions" || change.resizing !== false) continue;
        const dimensions = change.dimensions;
        if (!dimensions) continue;

        let node = nodesRef.current.find(
          (n) => "id" in n && n.id === change.id,
        );
        if (!node) continue;
        for (const other of changes) {
          if (!("id" in other) || other.id !== change.id) continue;
          if (other.type === "position" && other.position) {
            node = { ...node, position: other.position };
          }
          if (other.type === "dimensions" && other.dimensions) {
            node = {
              ...node,
              measured: { ...node.measured, ...other.dimensions },
            };
          }
        }

        const row = (node.data as { row: WorkspaceNode }).row;
        if (row.kind === "group") continue;
        const width = dimensions.width;
        const height = dimensions.height;
        const position = node.position;

        // Auto-expand parent group if member card resize exceeds bounds
        if (row.group_id) {
          const groupNode = nodesRef.current.find((n) => n.id === row.group_id);
          if (groupNode) {
            const gw =
              (groupNode.style?.width as number) ??
              groupNode.measured?.width ??
              360;
            const gh =
              (groupNode.style?.height as number) ??
              groupNode.measured?.height ??
              240;
            const requiredW = position.x + width + 24;
            const requiredH = position.y + height + 24;
            if (requiredW > gw || requiredH > gh) {
              const newGw = Math.max(gw, requiredW);
              const newGh = Math.max(gh, requiredH);
              queueSizeWrite({
                workspaceId,
                nodeId: row.group_id,
                width: newGw,
                height: newGh,
              });
              queryClient.setQueryData<WorkspaceNode[]>(
                workspaceKeys.nodes.list(workspaceId, isGuestMode),
                (old) =>
                  old?.map((n) =>
                    n.id === row.group_id
                      ? { ...n, width: newGw, height: newGh }
                      : n,
                  ),
              );
            }
          }
        }

        if (
          row.width === width &&
          row.height === height &&
          row.position_x === position.x &&
          row.position_y === position.y
        ) {
          continue;
        }

        queryClient.setQueryData<WorkspaceNode[]>(
          workspaceKeys.nodes.list(workspaceId, isGuestMode),
          (old) =>
            old?.map((n) =>
              n.id === row.id
                ? {
                    ...n,
                    width,
                    height,
                    position_x: position.x,
                    position_y: position.y,
                  }
                : n,
            ),
        );
        queueSizeWrite({ workspaceId, nodeId: row.id, width, height });
        if (row.position_x !== position.x || row.position_y !== position.y) {
          queuePositionWrite({ workspaceId, nodeId: row.id, position });
        }
      }
    },
    [
      onNodesChange,
      queryClient,
      workspaceId,
      isGuestMode,
      queueSizeWrite,
      queuePositionWrite,
    ],
  );

  // ── Grouping ───────────────────────────────────────────────────────────
  const selectedNodes = nodes.filter((node) => node.selected);
  const selectedGroupNodes = selectedNodes.filter(
    (n) => (n.data as { row: WorkspaceNode }).row.kind === "group",
  );
  const selectedContentNodes = selectedNodes.filter(
    (n) => (n.data as { row: WorkspaceNode }).row.kind !== "group",
  );

  const handleCreateGroup = useCallback(async () => {
    if (selectedContentNodes.length < 2) return;

    const targetBounds = selectedContentNodes.map((n) => {
      const row = (n.data as { row: WorkspaceNode }).row;
      const spec = getNodeKindSpec(row.kind);
      const width =
        n.measured?.width ??
        (typeof row.width === "number" ? row.width : null) ??
        spec?.defaults.width ??
        240;
      const height =
        n.measured?.height ??
        (typeof row.height === "number" ? row.height : null) ??
        spec?.defaults.height ??
        100;

      let absX = n.position.x;
      let absY = n.position.y;
      if (n.parentId) {
        const parent = nodes.find((p) => p.id === n.parentId);
        if (parent) {
          absX += parent.position.x;
          absY += parent.position.y;
        }
      }

      return {
        id: n.id,
        x: absX,
        y: absY,
        width,
        height,
      };
    });

    const minX = Math.min(...targetBounds.map((b) => b.x));
    const minY = Math.min(...targetBounds.map((b) => b.y));
    const maxX = Math.max(...targetBounds.map((b) => b.x + b.width));
    const maxY = Math.max(...targetBounds.map((b) => b.y + b.height));

    const PAD_X = 24;
    const PAD_TOP = 44;
    const PAD_BOTTOM = 24;

    const groupX = Math.round(minX - PAD_X);
    const groupY = Math.round(minY - PAD_TOP);
    const groupW = Math.round(maxX - minX + PAD_X * 2);
    const groupH = Math.round(maxY - minY + PAD_TOP + PAD_BOTTOM);

    const members = targetBounds.map((b) => ({
      id: b.id,
      position: {
        x: Math.round(b.x - groupX),
        y: Math.round(b.y - groupY),
      },
    }));

    await nodeCommands.createGroup(
      { queryClient, isGuestMode },
      {
        workspaceId,
        group: {
          position: { x: groupX, y: groupY },
          width: groupW,
          height: groupH,
          title: t("workspace.group.defaultTitle"),
        },
        members,
      },
    );
  }, [selectedContentNodes, nodes, queryClient, isGuestMode, workspaceId, t]);

  const runGroupCommand = useCallback(
    async (run: () => Promise<unknown>, failureKey: TranslationKey) => {
      try {
        await run();
      } catch (err: unknown) {
        console.error("Grouping failed:", err);
        notify.error(t(failureKey));
      }
    },
    [t],
  );

  const groupAction: {
    key: "group" | "ungroup";
    label: string;
    run: () => Promise<unknown>;
  } | null = useMemo(() => {
    // Case 1: Exactly 1 group node selected
    if (selectedGroupNodes.length === 1 && selectedContentNodes.length === 0) {
      const groupId = selectedGroupNodes[0].id;
      return {
        key: "ungroup",
        label: t("workspace.toolbar.ungroup"),
        run: () =>
          runGroupCommand(
            () =>
              nodeCommands.ungroup(
                { queryClient, isGuestMode },
                { workspaceId, groupId },
              ),
            "workspace.group.ungroupFailed",
          ),
      };
    }

    // Case 2: Selected content nodes belong to the SAME group
    const memberGroupIds = new Set(
      selectedContentNodes
        .map((n) => (n.data as { row: WorkspaceNode }).row.group_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );
    if (
      selectedGroupNodes.length === 0 &&
      selectedContentNodes.length > 0 &&
      memberGroupIds.size === 1
    ) {
      const groupId = [...memberGroupIds][0];
      return {
        key: "ungroup",
        label: t("workspace.toolbar.ungroup"),
        run: () =>
          runGroupCommand(
            () =>
              nodeCommands.ungroup(
                { queryClient, isGuestMode },
                { workspaceId, groupId },
              ),
            "workspace.group.ungroupFailed",
          ),
      };
    }

    // Case 3: 2 or more content nodes selected (can be grouped)
    if (selectedContentNodes.length >= 2 && selectedGroupNodes.length === 0) {
      return {
        key: "group",
        label: t("workspace.toolbar.group"),
        run: () =>
          runGroupCommand(handleCreateGroup, "workspace.group.createFailed"),
      };
    }

    return null;
  }, [
    selectedGroupNodes,
    selectedContentNodes,
    t,
    handleCreateGroup,
    runGroupCommand,
    queryClient,
    isGuestMode,
    workspaceId,
  ]);

  /**
   * Drawing a connection. The id is minted here, not inside the command, so
   * the line the user sees and the row that gets written are the same edge:
   * when the refetch confirms it, nothing remounts and nothing blinks.
   */
  const handleConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const { source, target, sourceHandle, targetHandle } = connection;
      if (!source || !target || source === target) return;

      const edgeId = crypto.randomUUID();
      pendingEdgeIdsRef.current.add(edgeId);
      setEdges((current) => [
        ...current,
        {
          id: edgeId,
          source,
          target,
          sourceHandle: sourceHandle ?? undefined,
          targetHandle: targetHandle ?? undefined,
          type: "default",
          data: {
            edgeId,
            workspaceId,
            label: null,
            onUpdateLabel: (newLabel: string) =>
              handleUpdateEdgeLabel(edgeId, newLabel),
          },
        },
      ]);

      void edgeCommands
        .add(
          { queryClient, isGuestMode },
          {
            id: edgeId,
            workspaceId,
            sourceNodeId: source,
            targetNodeId: target,
            ...(sourceHandle ? { source_handle: sourceHandle } : {}),
            ...(targetHandle ? { target_handle: targetHandle } : {}),
          },
        )
        .catch((err) => {
          console.error("Failed to connect nodes:", err);
          notify.error(t("workspace.canvas.connectFailed"));
        });
    },
    [queryClient, isGuestMode, workspaceId, t, handleUpdateEdgeLabel],
  );

  const handleConnectStart: OnConnectStart = useCallback((_event, params) => {
    connectStartRef.current = {
      nodeId: params.nodeId,
      handleType: params.handleType,
    };
  }, []);

  /**
   * Helper to convert client/mouse coordinates into flow world coordinates.
   */
  const getFlowPositionFromScreen = useCallback(
    (clientX: number, clientY: number): NodePosition => {
      if (reactFlowInstanceRef.current) {
        return reactFlowInstanceRef.current.screenToFlowPosition({
          x: clientX,
          y: clientY,
        });
      }
      const rect = wrapperRef.current?.getBoundingClientRect();
      const vp = useWorkspaceViewportStore
        .getState()
        .getViewport(workspaceId) ?? { x: 0, y: 0, zoom: 1 };
      return {
        x: Math.round((clientX - (rect?.left ?? 0) - vp.x) / vp.zoom),
        y: Math.round((clientY - (rect?.top ?? 0) - vp.y) / vp.zoom),
      };
    },
    [workspaceId],
  );

  const connectPendingSource = useCallback(
    (newNodeId: string) => {
      if (!pendingSourceNodeId) return;
      const source = pendingSourceNodeId;
      setPendingSourceNodeId(null);
      const edgeId = crypto.randomUUID();
      pendingEdgeIdsRef.current.add(edgeId);
      setEdges((current) => [
        ...current,
        {
          id: edgeId,
          source,
          target: newNodeId,
          type: "default",
          data: {
            edgeId,
            workspaceId,
            label: null,
            onUpdateLabel: (newLabel: string) =>
              handleUpdateEdgeLabel(edgeId, newLabel),
          },
        },
      ]);
      void edgeCommands
        .add(
          { queryClient, isGuestMode },
          {
            id: edgeId,
            workspaceId,
            sourceNodeId: source,
            targetNodeId: newNodeId,
          },
        )
        .catch((err) => {
          console.error("Failed to connect nodes:", err);
        });
    },
    [
      pendingSourceNodeId,
      workspaceId,
      queryClient,
      isGuestMode,
      setEdges,
      handleUpdateEdgeLabel,
    ],
  );

  /**
   * Mindmap connection flow: dragging from a port into empty canvas
   * opens the quick-add menu at that position, and creates a connecting edge upon creation.
   */
  const handleConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      const startInfo = connectStartRef.current;
      connectStartRef.current = null;

      if (connectionState.isValid) return;
      const sourceId = startInfo?.nodeId ?? connectionState.fromNode?.id;
      if (!sourceId) return;

      let clientX = 0;
      let clientY = 0;
      if (
        "clientX" in event &&
        typeof (event as MouseEvent).clientX === "number"
      ) {
        clientX = (event as MouseEvent).clientX;
        clientY = (event as MouseEvent).clientY;
      } else if (
        "changedTouches" in event &&
        (event as TouchEvent).changedTouches.length > 0
      ) {
        clientX = (event as TouchEvent).changedTouches[0].clientX;
        clientY = (event as TouchEvent).changedTouches[0].clientY;
      }

      let flowPos: NodePosition;
      if (clientX && clientY) {
        flowPos = getFlowPositionFromScreen(clientX, clientY);
      } else if (connectionState.to) {
        flowPos = {
          x: Math.round(connectionState.to.x),
          y: Math.round(connectionState.to.y),
        };
        if (reactFlowInstanceRef.current) {
          const screen =
            reactFlowInstanceRef.current.flowToScreenPosition(flowPos);
          clientX = screen.x;
          clientY = screen.y;
        }
      } else {
        return;
      }

      setPendingSourceNodeId(sourceId);
      setAddPosition(flowPos);
      setQuickMenuAnchor({ x: clientX, y: clientY });
      setQuickMenuOpen(true);
    },
    [getFlowPositionFromScreen],
  );

  /**
   * Double clicking empty canvas opens the quick-add menu right at the cursor position.
   */
  const handleCanvasDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (
        target.closest(".react-flow__node:not(.react-flow__node-group)") ||
        target.closest(".react-flow__edge") ||
        target.closest(".react-flow__controls") ||
        target.closest(
          "button, [role='button'], input, textarea, a, [role='dialog'], [role='menu']",
        ) ||
        target.closest(".ws-group-node__head") ||
        target.closest(".react-flow__resize-control")
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const flowPos = getFlowPositionFromScreen(event.clientX, event.clientY);
      setPendingSourceNodeId(null);
      setAddPosition(flowPos);
      setQuickMenuAnchor({ x: event.clientX, y: event.clientY });
      setQuickMenuOpen(true);
    },
    [getFlowPositionFromScreen],
  );

  /**
   * Right clicking empty canvas intercepts browser context menu and opens quick-add menu.
   */
  const handleCanvasContextMenu = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (
        target.closest(".react-flow__node:not(.react-flow__node-group)") ||
        target.closest(".react-flow__edge") ||
        target.closest(".react-flow__controls") ||
        target.closest(
          "button, [role='button'], input, textarea, a, [role='dialog'], [role='menu']",
        ) ||
        target.closest(".ws-group-node__head") ||
        target.closest(".react-flow__resize-control")
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const flowPos = getFlowPositionFromScreen(event.clientX, event.clientY);
      setPendingSourceNodeId(null);
      setAddPosition(flowPos);
      setQuickMenuAnchor({ x: event.clientX, y: event.clientY });
      setQuickMenuOpen(true);
    },
    [getFlowPositionFromScreen],
  );

  /**
   * Double clicking a task node opens the right-side detail edit sheet.
   */
  const handleNodeDoubleClick = useCallback(
    (event: React.MouseEvent, node: WorkspaceFlowNode) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      // Exclude clicks on action buttons (like delete), checkboxes, inputs, or menus
      if (
        target.closest(
          "button, [role='button'], [role='checkbox'], input, textarea, a, [data-testid*='remove'], [data-testid*='toggle']",
        )
      ) {
        return;
      }

      const row = node.data?.row as WorkspaceNode | undefined;
      if (row?.kind === "task" && row?.entity_id) {
        const targetTask = tasks.find((t) => t.id === row.entity_id);
        if (targetTask) {
          setEditingTaskId(row.entity_id);
        }
      }
    },
    [tasks],
  );

  /**
   * A connection may not loop onto its own node, and one ordered pair holds
   * one connection: redrawing A → B is a no-op rather than a duplicate the
   * database would reject.
   */
  const isValidConnection = useCallback(
    (connection: Connection | WorkspaceFlowEdge) => {
      const { source, target } = connection;
      if (!source || !target || source === target) return false;
      return !edges.some(
        (edge) => edge.source === source && edge.target === target,
      );
    },
    [edges],
  );

  // Selection and the local half of a cut. React Flow fires this alongside
  // `onEdgesDelete`; only the latter is a write, so this stays view state.
  const handleEdgesChange: OnEdgesChange<WorkspaceFlowEdge> = useCallback(
    (changes) => {
      setEdges((current) =>
        changes.reduce<WorkspaceFlowEdge[]>((next, change) => {
          if (change.type === "select") {
            return next.map((edge) =>
              edge.id === change.id
                ? { ...edge, selected: change.selected }
                : edge,
            );
          }
          if (change.type === "remove") {
            return next.filter((edge) => edge.id !== change.id);
          }
          return next;
        }, current),
      );
    },
    [],
  );

  /**
   * Deleting node(s) from keyboard or canvas selection with full undo support.
   */
  const handleNodesDelete = useCallback(
    async (deletedFlowNodes: WorkspaceFlowNode[]) => {
      const nodeRefs = deletedFlowNodes
        .filter((n) => (n.data as { row?: WorkspaceNode })?.row?.id)
        .map((n) => ({
          id: (n.data as { row: WorkspaceNode }).row.id,
          workspace_id: workspaceId,
        }));
      if (nodeRefs.length === 0) return;

      for (const node of nodeRefs) {
        deletingNodeIdsRef.current.add(node.id);
      }
      setTimeout(() => {
        for (const node of nodeRefs) {
          deletingNodeIdsRef.current.delete(node.id);
        }
      }, 1000);

      try {
        if (nodeRefs.length === 1) {
          await nodeCommands.remove({ queryClient, isGuestMode }, nodeRefs[0]);
        } else {
          await nodeCommands.removeBatch(
            { queryClient, isGuestMode },
            workspaceId,
            nodeRefs,
          );
        }
      } catch (err) {
        console.error("Failed to delete node(s):", err);
        notify.error(t("workspace.node.removeFailed"));
      }
    },
    [queryClient, isGuestMode, workspaceId, t],
  );

  /**
   * Cutting a connection with undo support.
   */
  const handleEdgesDelete = useCallback(
    (deleted: WorkspaceFlowEdge[]) => {
      const selectedNodeIds = new Set(
        nodesRef.current.filter((n) => n.selected).map((n) => n.id),
      );
      // Filter out edges attached to nodes being deleted; nodeCommands.remove / removeBatch
      // captures and restores incident edges atomically as part of the node snapshot.
      const isIncidentToDeletingNode = (edge: WorkspaceFlowEdge) => {
        const sourceId = edge.source;
        const targetId = edge.target;
        return (
          deletingNodeIdsRef.current.has(sourceId) ||
          deletingNodeIdsRef.current.has(targetId) ||
          selectedNodeIds.has(sourceId) ||
          selectedNodeIds.has(targetId)
        );
      };

      const edgesToProcess = deleted.filter(
        (edge) => !isIncidentToDeletingNode(edge),
      );
      if (edgesToProcess.length === 0) return;

      const deletedEdges: WorkspaceEdge[] = [];
      for (const edge of edgesToProcess) {
        const data = edge.data;
        if (!data) continue;

        const row = (workspaceEdges ?? []).find((e) => e.id === data.edgeId);
        if (row) deletedEdges.push(row);

        queryClient.setQueryData<WorkspaceEdge[]>(
          workspaceKeys.edges.list(workspaceId, isGuestMode),
          (old) => old?.filter((r) => r.id !== data.edgeId),
        );
        pendingEdgeIdsRef.current.delete(data.edgeId);
        void edgeCommands
          .remove(
            { queryClient, isGuestMode },
            { id: data.edgeId, workspace_id: workspaceId },
          )
          .catch((err) => {
            console.error("Failed to delete edge:", err);
            notify.error(t("workspace.canvas.disconnectFailed"));
          });
      }

      if (deletedEdges.length > 0) {
        const undoAction = async () => {
          try {
            for (const e of deletedEdges) {
              await edgeCommands.add(
                { queryClient, isGuestMode },
                {
                  id: e.id,
                  workspaceId: e.workspace_id,
                  sourceNodeId: e.source_node_id,
                  targetNodeId: e.target_node_id,
                  label: e.label,
                  sourceHandle: e.source_handle,
                  targetHandle: e.target_handle,
                },
              );
            }
            notify(t("workspace.canvas.edgeRestored"));
          } catch (err) {
            console.error("Failed to restore edges:", err);
            notify.error(t("workspace.canvas.restoreFailed"));
          }
        };

        const redoAction = async () => {
          for (const e of deletedEdges) {
            await edgeCommands.remove(
              { queryClient, isGuestMode },
              { id: e.id, workspace_id: workspaceId },
            );
          }
        };

        useWorkspaceUndoStore.getState().pushAction(workspaceId, {
          id: crypto.randomUUID(),
          description: `delete-edges-${deletedEdges.length}`,
          undo: undoAction,
          redo: redoAction,
        });

        notify(t("workspace.canvas.disconnect"), {
          duration: 7000,
          action: {
            label: t("workspace.canvas.undo"),
            onClick: undoAction,
          },
        });
      }
    },
    [queryClient, isGuestMode, workspaceId, workspaceEdges, t],
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

  const createImageFromFile = useCallback(
    async (
      file: File,
      position: NodePosition = addPosition,
      source: "upload" | "drop" | "paste" = "upload",
    ) => {
      if (!file.type.startsWith("image/") && file.type !== "") return;
      try {
        const created = await visualCommands.createImageNode(
          { queryClient, isGuestMode },
          {
            workspaceId,
            position,
            bytes: file,
            mimeType: file.type || undefined,
            source,
            title: file.name || undefined,
          },
        );
        notify(t("workspace.canvas.imageAdded"));
        if (pendingSourceNodeId) connectPendingSource(created.node.id);
      } catch (err) {
        console.error("Failed to add image node:", err);
        notify.error(
          err instanceof Error
            ? err.message
            : t("workspace.canvas.imageAddFailed"),
        );
      } finally {
        setPendingSourceNodeId(null);
      }
    },
    [
      addPosition,
      connectPendingSource,
      isGuestMode,
      pendingSourceNodeId,
      queryClient,
      t,
      workspaceId,
    ],
  );

  const handleImageInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) void createImageFromFile(file);
    },
    [createImageFromFile],
  );

  const handleCanvasDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const file = event.dataTransfer.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      event.preventDefault();
      event.stopPropagation();
      void createImageFromFile(
        file,
        getFlowPositionFromScreen(event.clientX, event.clientY),
        "drop",
      );
    },
    [createImageFromFile, getFlowPositionFromScreen],
  );

  const handleCanvasPaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      const file = Array.from(event.clipboardData.files).find((item) =>
        item.type.startsWith("image/"),
      );
      if (!file) return;
      event.preventDefault();
      void createImageFromFile(file, getCenterPosition(), "paste");
    },
    [createImageFromFile, getCenterPosition],
  );

  const openAddDialog = useCallback(
    (kind: AddNodeDialogKind, customPosition?: NodePosition) => {
      setAddPosition(customPosition ?? getCenterPosition());
      setAddDialogKind(kind);
    },
    [getCenterPosition],
  );

  // A focus node references the timer singleton, not an entity — there is
  // no picker; the menu item places it directly through the kind's
  // registry binding (ADR 0020).
  const addFocusNode = useCallback(
    async (customPosition?: NodePosition) => {
      const spec = getNodeKindSpec("focus");
      if (!spec) return;
      const pos = customPosition ?? addPosition ?? getCenterPosition();
      try {
        const createdNode = await (spec.commands as FocusNodeCommands).add(
          { queryClient, isGuestMode },
          { workspaceId, position: pos },
        );
        notify(t("workspace.canvas.focusAdded"));
        if (createdNode && pendingSourceNodeId) {
          connectPendingSource(createdNode.id);
        }
      } catch (err) {
        console.error("Failed to add focus node:", err);
        notify.error(t("workspace.canvas.focusAddFailed"));
      } finally {
        setPendingSourceNodeId(null);
      }
    },
    [
      queryClient,
      isGuestMode,
      workspaceId,
      addPosition,
      getCenterPosition,
      pendingSourceNodeId,
      connectPendingSource,
      t,
    ],
  );

  // A doc node references pure workspace text/markdown note, not an entity.
  const addDocNode = useCallback(
    async (customPosition?: NodePosition) => {
      const spec = getNodeKindSpec("doc");
      if (!spec) return;
      const pos = customPosition ?? addPosition ?? getCenterPosition();
      try {
        const createdNode = await (spec.commands as DocNodeCommands).add(
          { queryClient, isGuestMode },
          { workspaceId, position: pos },
        );
        notify(t("workspace.canvas.docAdded"));
        if (createdNode && pendingSourceNodeId) {
          connectPendingSource(createdNode.id);
        }
      } catch (err) {
        console.error("Failed to add doc node:", err);
        notify.error(t("workspace.canvas.docAddFailed"));
      } finally {
        setPendingSourceNodeId(null);
      }
    },
    [
      queryClient,
      isGuestMode,
      workspaceId,
      addPosition,
      getCenterPosition,
      pendingSourceNodeId,
      connectPendingSource,
      t,
    ],
  );

  // A decision node references conditional branching logic, pure layout.
  const addDecisionNode = useCallback(
    async (customPosition?: NodePosition) => {
      const spec = getNodeKindSpec("decision");
      if (!spec) return;
      const pos = customPosition ?? addPosition ?? getCenterPosition();
      try {
        const createdNode = await (spec.commands as DecisionNodeCommands).add(
          { queryClient, isGuestMode },
          { workspaceId, position: pos },
        );
        notify(t("workspace.canvas.decisionAdded"));
        if (createdNode && pendingSourceNodeId) {
          connectPendingSource(createdNode.id);
        }
      } catch (err) {
        console.error("Failed to add decision node:", err);
        notify.error(t("workspace.canvas.decisionAddFailed"));
      } finally {
        setPendingSourceNodeId(null);
      }
    },
    [
      queryClient,
      isGuestMode,
      workspaceId,
      addPosition,
      getCenterPosition,
      pendingSourceNodeId,
      connectPendingSource,
      t,
    ],
  );

  // A step node references procedural intermediate states, pure layout.
  const addStepNode = useCallback(
    async (customPosition?: NodePosition) => {
      const spec = getNodeKindSpec("step");
      if (!spec) return;
      const pos = customPosition ?? addPosition ?? getCenterPosition();
      try {
        const createdNode = await (spec.commands as StepNodeCommands).add(
          { queryClient, isGuestMode },
          { workspaceId, position: pos },
        );
        notify(t("workspace.canvas.stepAdded"));
        if (createdNode && pendingSourceNodeId) {
          connectPendingSource(createdNode.id);
        }
      } catch (err) {
        console.error("Failed to add step node:", err);
        notify.error(t("workspace.canvas.stepAddFailed"));
      } finally {
        setPendingSourceNodeId(null);
      }
    },
    [
      queryClient,
      isGuestMode,
      workspaceId,
      addPosition,
      getCenterPosition,
      pendingSourceNodeId,
      connectPendingSource,
      t,
    ],
  );

  /**
   * Fast inline task creation: creates task directly in inbox and places node at addPosition.
   */
  const handleQuickCreateTask = useCallback(
    async (title: string) => {
      const spec = getNodeKindSpec("task");
      if (!spec) return;
      const pos = addPosition ?? getCenterPosition();

      try {
        const newTask = await taskCommands.create(
          { queryClient, isGuestMode },
          { content: title, project_id: undefined },
        );

        const createdNode = await (spec.commands as TaskNodeCommands).add(
          { queryClient, isGuestMode },
          { workspaceId, taskId: newTask.id, position: pos },
        );

        notify(t("workspace.canvas.taskCreated"));

        if (createdNode && pendingSourceNodeId) {
          connectPendingSource(createdNode.id);
        }
      } catch (err) {
        console.error("Failed to quick create task:", err);
        notify.error(t("workspace.canvas.taskCreateFailed"));
      } finally {
        setPendingSourceNodeId(null);
      }
    },
    [
      addPosition,
      getCenterPosition,
      queryClient,
      isGuestMode,
      workspaceId,
      pendingSourceNodeId,
      connectPendingSource,
      t,
    ],
  );

  return (
    <div
      ref={wrapperRef}
      className="relative w-full h-full border-t border-border md:border-t-0"
      data-testid="workspace-canvas"
      data-workspace-id={workspaceId}
      onDoubleClick={handleCanvasDoubleClick}
      onContextMenu={handleCanvasContextMenu}
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes("Files")) {
          event.preventDefault();
        }
      }}
      onDrop={handleCanvasDrop}
      onPaste={handleCanvasPaste}
      tabIndex={0}
    >
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        nodeTypes={workspaceNodeTypes}
        edgeTypes={workspaceEdgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        onConnect={handleConnect}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        onEdgesDelete={handleEdgesDelete}
        onNodesDelete={handleNodesDelete}
        onNodeDoubleClick={handleNodeDoubleClick}
        isValidConnection={isValidConnection}
        defaultViewport={savedViewport ?? { x: 0, y: 0, zoom: 1 }}
        onMoveEnd={handleMoveEnd}
        onInit={(instance) => {
          reactFlowInstanceRef.current = instance;
        }}
        zoomOnDoubleClick={false}
        // Elements are selectable and deletable by keyboard; onNodesDelete
        // and onEdgesDelete route through command layer with undo snapshots.
        elementsSelectable
        nodesConnectable
        nodesDraggable
        deleteKeyCode={["Backspace", "Delete"]}
        // Ports are 9px; a generous drop radius keeps them grabbable on
        // touch without turning a node drag into a connection.
        connectionRadius={28}
        minZoom={0.25}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.5}
          color="var(--canvas-grid)"
        />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>

      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          className="hidden"
          onChange={handleImageInputChange}
          data-testid="image-node-file-input"
        />
        <div className="flex items-center rounded-md border border-border bg-background shadow-xs">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void undo()}
            disabled={!canUndo}
            title={t("workspace.canvas.undoTooltip", {
              key: isMac ? "⌘Z" : "Ctrl+Z",
            })}
            data-testid="workspace-undo-btn"
            aria-label={t("workspace.canvas.undo")}
            className="h-8 px-2 rounded-r-none border-r border-border disabled:opacity-40"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void redo()}
            disabled={!canRedo}
            title={t("workspace.canvas.redoTooltip", {
              key: isMac ? "⌘⇧Z" : "Ctrl+Y",
            })}
            data-testid="workspace-redo-btn"
            aria-label={t("workspace.canvas.redo")}
            className="h-8 px-2 rounded-l-none disabled:opacity-40"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>

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
            <DropdownMenuItem
              data-testid="add-node-doc"
              onClick={() => void addDocNode()}
              className="gap-2.5"
            >
              <FileText className="h-4 w-4" strokeWidth={2.25} />
              {t("workspace.canvas.addDoc")}
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="add-node-decision"
              onClick={() => void addDecisionNode()}
              className="gap-2.5"
            >
              <GitBranch className="h-4 w-4" strokeWidth={2.25} />
              {t("workspace.canvas.addDecision")}
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="add-node-step"
              onClick={() => void addStepNode()}
              className="gap-2.5"
            >
              <Workflow className="h-4 w-4" strokeWidth={2.25} />
              {t("workspace.canvas.addStep")}
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="add-node-image"
              onClick={() => {
                setAddPosition(getCenterPosition());
                imageInputRef.current?.click();
              }}
              className="gap-2.5"
            >
              <ImageIcon className="h-4 w-4" strokeWidth={2.25} />
              {t("workspace.canvas.addImage")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setVisualRelationsOpen(true)}
          title={t("workspace.visualRelations.open")}
          aria-label={t("workspace.visualRelations.open")}
          data-testid="visual-relations-button"
          className="gap-2 bg-background"
        >
          <Link2 className="h-4 w-4" strokeWidth={2.25} />
          <span className="hidden sm:inline">
            {t("workspace.visualRelations.open")}
          </span>
        </Button>

        {isGuestMode ? (
          <GuestAssetBridgeButton workspaceId={workspaceId} />
        ) : null}

        {groupAction ? (
          <Button
            variant="outline"
            size="sm"
            data-testid={`workspace-${groupAction.key}-button`}
            onClick={() => void groupAction.run()}
            className="gap-2 bg-background shadow-xs text-xs font-medium"
          >
            {groupAction.key === "group" ? (
              <Group className="h-4 w-4" strokeWidth={2.25} />
            ) : (
              <Ungroup className="h-4 w-4" strokeWidth={2.25} />
            )}
            <span>{groupAction.label}</span>
          </Button>
        ) : null}
      </div>

      <QuickAddMenu
        open={quickMenuOpen}
        anchor={quickMenuAnchor}
        onClose={() => {
          setQuickMenuOpen(false);
          setPendingSourceNodeId(null);
        }}
        onQuickCreateTask={handleQuickCreateTask}
        onPickExistingTask={() => openAddDialog("task", addPosition)}
        onPickExistingProject={() => openAddDialog("project", addPosition)}
        onAddHabit={() => openAddDialog("habit", addPosition)}
        onAddEvent={() => openAddDialog("event", addPosition)}
        onAddFocus={() => void addFocusNode(addPosition)}
        onAddDoc={() => void addDocNode(addPosition)}
        onAddDecision={() => void addDecisionNode(addPosition)}
        onAddStep={() => void addStepNode(addPosition)}
        onAddImage={() => {
          setAddPosition(addPosition);
          imageInputRef.current?.click();
        }}
        onFitView={() =>
          reactFlowInstanceRef.current?.fitView({ duration: 300 })
        }
      />

      <VisualRelationsPanel
        workspaceId={workspaceId}
        nodes={workspaceNodes ?? []}
        selectedNodeIds={selectedNodes.map((node) => node.id)}
        open={visualRelationsOpen}
        onOpenChange={setVisualRelationsOpen}
      />

      <AddTaskNodeDialog
        workspaceId={workspaceId}
        position={addPosition}
        open={addDialogKind === "task"}
        onOpenChange={(open) => {
          setAddDialogKind(open ? "task" : null);
          if (!open) setPendingSourceNodeId(null);
        }}
        onNodeAdded={(node) => connectPendingSource(node.id)}
      />
      <AddProjectNodeDialog
        workspaceId={workspaceId}
        position={addPosition}
        open={addDialogKind === "project"}
        onOpenChange={(open) => {
          setAddDialogKind(open ? "project" : null);
          if (!open) setPendingSourceNodeId(null);
        }}
        onNodeAdded={(node) => connectPendingSource(node.id)}
      />
      <AddHabitNodeDialog
        workspaceId={workspaceId}
        position={addPosition}
        open={addDialogKind === "habit"}
        onOpenChange={(open) => {
          setAddDialogKind(open ? "habit" : null);
          if (!open) setPendingSourceNodeId(null);
        }}
        onNodeAdded={(node) => connectPendingSource(node.id)}
      />
      <AddEventNodeDialog
        workspaceId={workspaceId}
        position={addPosition}
        open={addDialogKind === "event"}
        onOpenChange={(open) => {
          setAddDialogKind(open ? "event" : null);
          if (!open) setPendingSourceNodeId(null);
        }}
        onNodeAdded={(node) => connectPendingSource(node.id)}
      />

      <Sheet
        open={Boolean(editingTaskId && activeTaskForPanel)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingTaskId(null);
          }
        }}
      >
        <SheetContent
          side="right"
          showClose={false}
          className="p-0 sm:max-w-xl w-full border-l border-border bg-background/95 backdrop-blur-md shadow-2xl overflow-hidden flex flex-col h-full"
          data-testid="workspace-task-detail-sheet"
        >
          <SheetTitle className="sr-only">
            {activeTaskForPanel?.content ?? "Task details"}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Edit task details, subtasks, and schedule
          </SheetDescription>
          {activeTaskForPanel && (
            <TaskDetailPanel
              task={activeTaskForPanel}
              onClose={() => setEditingTaskId(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
