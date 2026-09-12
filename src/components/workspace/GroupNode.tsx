"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  NodeResizeControl,
  ResizeControlVariant,
  useNodeId,
  useReactFlow,
  type ControlLinePosition,
  type ControlPosition,
  type OnResize,
  type OnResizeEnd,
} from "@xyflow/react";
import { Ungroup } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useWorkspaceNodes } from "@/lib/hooks/useWorkspaceNodes";
import { nodeCommands } from "@/lib/commands/node";
import { notify } from "@/lib/notify";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { cn } from "@/lib/utils";
import { workspaceKeys } from "@/lib/queries/workspace-keys";
import { useNodePositionWrites } from "./useNodePositionWrites";
import { useNodeSizeWrites } from "./useNodeSizeWrites";
import type {
  WorkspaceFlowNode,
  WorkspaceNodeComponentProps,
} from "./node-registry";
import type { GroupDisplayConfig, WorkspaceNode } from "@/lib/types/workspace";

const GROUP_MIN_WIDTH = 240;
const GROUP_MIN_HEIGHT = 160;

const RESIZE_EDGE_POSITIONS: ControlPosition[] = [
  "top",
  "bottom",
  "left",
  "right",
];

const RESIZE_CORNER_POSITIONS: ControlPosition[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

const RESIZE_LINE_POSITIONS: ControlLinePosition[] = [
  "top",
  "bottom",
  "left",
  "right",
];

interface GroupResizerProps {
  groupId: string;
  row: WorkspaceNode;
  allNodes?: WorkspaceNode[];
}

/**
 * GroupResizer — 8-direction resize handles and coordinate synchronization.
 *
 * Renders 4 corner handles and 4 edge handles with pill grabbers and expanded hit targets.
 * Handles top/left resize by smoothly updating parent position and inversely compensating
 * child relative positions, so member nodes stay visually locked in canvas space.
 */
function GroupResizer({ groupId, row, allNodes }: GroupResizerProps) {
  const { setNodes } = useReactFlow<WorkspaceFlowNode>();
  const queryClient = useQueryClient();
  const { isGuestMode } = useAuth();
  const { queuePositionWrite } = useNodePositionWrites();
  const { queueSizeWrite } = useNodeSizeWrites();

  const startRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const handleResizeStart = useCallback(() => {
    startRef.current = {
      x: row.position_x,
      y: row.position_y,
      width: row.width ?? GROUP_MIN_WIDTH,
      height: row.height ?? GROUP_MIN_HEIGHT,
    };
  }, [row.position_x, row.position_y, row.width, row.height]);

  const handleResize: OnResize = useCallback(
    (_event, params) => {
      const start = startRef.current ?? {
        x: row.position_x,
        y: row.position_y,
        width: row.width ?? GROUP_MIN_WIDTH,
        height: row.height ?? GROUP_MIN_HEIGHT,
      };

      const dx = params.x - start.x;
      const dy = params.y - start.y;

      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === groupId) {
            return {
              ...n,
              position: { x: params.x, y: params.y },
              style: {
                ...n.style,
                width: params.width,
                height: params.height,
              },
            };
          }
          if (n.parentId === groupId && (dx !== 0 || dy !== 0)) {
            const memberRow = allNodes?.find((m) => m.id === n.id);
            const origX = memberRow?.position_x ?? n.position.x;
            const origY = memberRow?.position_y ?? n.position.y;
            return {
              ...n,
              position: {
                x: Math.round(origX - dx),
                y: Math.round(origY - dy),
              },
            };
          }
          return n;
        }),
      );
    },
    [
      row.position_x,
      row.position_y,
      row.width,
      row.height,
      groupId,
      setNodes,
      allNodes,
    ],
  );

  const handleResizeEnd: OnResizeEnd = useCallback(
    (_event, params) => {
      const start = startRef.current ?? {
        x: row.position_x,
        y: row.position_y,
        width: row.width ?? GROUP_MIN_WIDTH,
        height: row.height ?? GROUP_MIN_HEIGHT,
      };
      startRef.current = null;

      const dx = params.x - start.x;
      const dy = params.y - start.y;
      const isPosChanged = dx !== 0 || dy !== 0;
      const isSizeChanged =
        params.width !== start.width || params.height !== start.height;

      if (!isPosChanged && !isSizeChanged) return;

      // 1. Layer 2: Optimistic cache write
      queryClient.setQueryData<WorkspaceNode[]>(
        workspaceKeys.nodes.list(row.workspace_id, isGuestMode),
        (old) =>
          old?.map((n) => {
            if (n.id === groupId) {
              return {
                ...n,
                position_x: params.x,
                position_y: params.y,
                width: params.width,
                height: params.height,
              };
            }
            if (n.group_id === groupId && isPosChanged) {
              return {
                ...n,
                position_x: Math.round(n.position_x - dx),
                position_y: Math.round(n.position_y - dy),
              };
            }
            return n;
          }),
      );

      // 2. Layer 3: Debounced persistence writes
      if (isSizeChanged) {
        queueSizeWrite({
          workspaceId: row.workspace_id,
          nodeId: groupId,
          width: params.width,
          height: params.height,
        });
      }

      if (isPosChanged) {
        queuePositionWrite({
          workspaceId: row.workspace_id,
          nodeId: groupId,
          position: { x: params.x, y: params.y },
        });

        const members = allNodes?.filter((n) => n.group_id === groupId) ?? [];
        for (const member of members) {
          queuePositionWrite({
            workspaceId: row.workspace_id,
            nodeId: member.id,
            position: {
              x: Math.round(member.position_x - dx),
              y: Math.round(member.position_y - dy),
            },
          });
        }
      }
    },
    [
      row.position_x,
      row.position_y,
      row.width,
      row.height,
      row.workspace_id,
      groupId,
      queryClient,
      isGuestMode,
      queueSizeWrite,
      queuePositionWrite,
      allNodes,
    ],
  );

  return (
    <>
      {RESIZE_LINE_POSITIONS.map((pos) => (
        <NodeResizeControl
          key={`line-${pos}`}
          position={pos}
          variant={ResizeControlVariant.Line}
          minWidth={GROUP_MIN_WIDTH}
          minHeight={GROUP_MIN_HEIGHT}
          onResizeStart={handleResizeStart}
          onResize={handleResize}
          onResizeEnd={handleResizeEnd}
          className="ws-resize-line"
        />
      ))}

      {RESIZE_CORNER_POSITIONS.map((pos) => (
        <NodeResizeControl
          key={`corner-${pos}`}
          position={pos}
          minWidth={GROUP_MIN_WIDTH}
          minHeight={GROUP_MIN_HEIGHT}
          onResizeStart={handleResizeStart}
          onResize={handleResize}
          onResizeEnd={handleResizeEnd}
          className="ws-resize-handle ws-resize-handle--corner"
        />
      ))}

      {RESIZE_EDGE_POSITIONS.map((pos) => (
        <NodeResizeControl
          key={`edge-${pos}`}
          position={pos}
          minWidth={GROUP_MIN_WIDTH}
          minHeight={GROUP_MIN_HEIGHT}
          onResizeStart={handleResizeStart}
          onResize={handleResize}
          onResizeEnd={handleResizeEnd}
          className={cn("ws-resize-handle ws-resize-handle--edge", pos)}
        />
      ))}
    </>
  );
}

/**
 * GroupNode — Visual container frame for grouped workspace nodes.
 *
 * Renders as a background container card with a header strip (dot, editable title,
 * member count, ungroup button), translucent matte background body, and NodeResizer handles.
 *
 * Children of this group have `parentId: group.id` in React Flow and are stacked
 * above this container. Dragging this group node moves all its member nodes seamlessly.
 */
export function GroupNode({ id, data }: WorkspaceNodeComponentProps) {
  const row = data.row;
  const nodeId = useNodeId();
  const queryClient = useQueryClient();
  const { isGuestMode } = useAuth();
  const { t } = useTranslation();

  const displayConfig = (row.display_config ?? {}) as GroupDisplayConfig;
  const currentTitle = displayConfig.title || t("workspace.group.defaultTitle");

  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const displayTitle = isEditing ? draftTitle : currentTitle;

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const startEditing = useCallback(() => {
    setDraftTitle(currentTitle);
    setIsEditing(true);
  }, [currentTitle]);

  const commitTitle = useCallback(async () => {
    const finalTitle = draftTitle.trim() || t("workspace.group.defaultTitle");
    setIsEditing(false);
    if (finalTitle === displayConfig.title) return;

    try {
      await nodeCommands.renameGroup(
        { queryClient, isGuestMode },
        {
          workspaceId: row.workspace_id,
          groupId: id,
          title: finalTitle,
        },
      );
    } catch (err) {
      console.error("Failed to rename group:", err);
      notify.error(t("workspace.group.renameFailed"));
    }
  }, [
    draftTitle,
    displayConfig.title,
    queryClient,
    isGuestMode,
    row.workspace_id,
    id,
    t,
  ]);

  const handleUngroup = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await nodeCommands.ungroup(
          { queryClient, isGuestMode },
          {
            workspaceId: row.workspace_id,
            groupId: id,
          },
        );
        notify(t("workspace.group.ungrouped"));
      } catch (err) {
        console.error("Failed to ungroup:", err);
        notify.error(t("workspace.group.ungroupFailed"));
      }
    },
    [queryClient, isGuestMode, row.workspace_id, id, t],
  );

  // Count member nodes belonging to this container
  const { data: allNodes } = useWorkspaceNodes(row.workspace_id);
  const memberCount = allNodes?.filter((n) => n.group_id === id).length ?? 0;

  const isDropTarget = Boolean(
    (data as unknown as { isDropTarget?: boolean })?.isDropTarget,
  );

  return (
    <div
      className={cn(
        "ws-group-node",
        isDropTarget && "ws-group-node--drop-target",
      )}
      data-testid={`group-node-${id}`}
      data-node-id={id}
    >
      {nodeId ? (
        <GroupResizer groupId={id} row={row} allNodes={allNodes} />
      ) : null}

      <div className="ws-group-node__head">
        <span className="ws-group-node__dot" aria-hidden="true" />

        {isEditing ? (
          <input
            ref={inputRef}
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={() => void commitTitle()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitTitle();
              if (e.key === "Escape") {
                setIsEditing(false);
              }
            }}
            className="ws-group-node__title-input nodrag nowheel"
          />
        ) : (
          <span
            className="ws-group-node__title"
            onDoubleClick={startEditing}
            title={t("workspace.group.renameHint")}
          >
            {displayTitle}
          </span>
        )}

        <span
          className="ws-group-node__count tabular-nums"
          title={`${memberCount} members`}
        >
          {memberCount.toString().padStart(2, "0")}
        </span>

        <Button
          variant="ghost"
          size="icon"
          data-testid={`group-node-ungroup-${id}`}
          className="ws-group-node__ungroup-btn nodrag"
          onClick={handleUngroup}
          title={t("workspace.toolbar.ungroup")}
        >
          <Ungroup className="h-3 w-3" />
        </Button>
      </div>

      <div className="ws-group-node__body" />
    </div>
  );
}
