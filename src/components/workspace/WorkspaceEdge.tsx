"use client";

import { useState, useCallback, useMemo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
  type EdgeTypes,
} from "@xyflow/react";
import { X } from "lucide-react";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { cn } from "@/lib/utils";

/**
 * WorkspaceEdge — Feishu-style interactive connection line.
 *
 * Renders React Flow's bezier curve with:
 * 1. A 24px invisible interaction path for effortless hovering and clicking.
 * 2. Visual highlight (stroke color and width) on hover or selection.
 * 3. A floating action pill/button rendered at the midpoint (labelX, labelY) via EdgeLabelRenderer.
 *    The button smoothly appears when hovered or selected, allowing users to disconnect/delete
 *    the line with a single click (or press Backspace/Delete when selected).
 */
export function WorkspaceEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  markerEnd,
  style,
}: EdgeProps) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);

  const reactFlow = useReactFlow();

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isVisible = Boolean(selected || isHovered);

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      reactFlow.deleteElements({ edges: [{ id }] });
    },
    [id, reactFlow],
  );

  const mergedStyle = useMemo(
    () => ({
      ...style,
      stroke: selected
        ? "hsl(var(--primary))"
        : isHovered
          ? "hsl(var(--foreground))"
          : undefined,
      strokeWidth: selected || isHovered ? 2 : 1.5,
      transition: "stroke 150ms ease, stroke-width 150ms ease",
    }),
    [style, selected, isHovered],
  );

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={mergedStyle}
        className={cn("ws-flow-edge", isHovered && "ws-flow-edge--hovered")}
      />

      {/* Invisible interaction path for comfortable hit-testing */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        className="cursor-pointer pointer-events-auto"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        data-testid={`workspace-edge-hitbox-${id}`}
      />

      {/* Feishu-style midpoint disconnect button */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            zIndex: 1000,
          }}
          className={cn(
            "nodrag nopan transition-all duration-150",
            isVisible
              ? "opacity-100 scale-100 pointer-events-auto"
              : "opacity-0 scale-75 pointer-events-none",
          )}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <button
            type="button"
            data-testid={`workspace-edge-disconnect-${id}`}
            onClick={handleDelete}
            title={t("workspace.canvas.disconnect")}
            aria-label={t("workspace.canvas.disconnect")}
            className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background shadow-xs text-muted-foreground hover:bg-destructive/15 hover:text-destructive hover:border-destructive/40 transition-colors"
          >
            <X className="h-3 w-3" strokeWidth={2.5} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const workspaceEdgeTypes: EdgeTypes = {
  default: WorkspaceEdge,
};
