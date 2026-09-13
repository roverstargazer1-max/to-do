"use client";

import { useState, useCallback, useMemo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  type EdgeMarker,
  type EdgeProps,
  type EdgeTypes,
} from "@xyflow/react";
import { X } from "lucide-react";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { cn } from "@/lib/utils";

/**
 * WorkspaceEdge — Feishu-style interactive connection line with conditional labels.
 *
 * Renders React Flow's smooth step curve with:
 * 1. An 8px rounded orthogonal path with 20px port offset (getSmoothStepPath).
 * 2. Directional arrowhead (MarkerType.ArrowClosed) synchronizing stroke color with line.
 * 3. A 24px invisible interaction path for effortless hovering and clicking.
 * 4. Visual highlight (stroke color and width) on hover or selection.
 * 5. High-contrast ink & opaque matte text pill badge at the midpoint (labelX, labelY) when label exists.
 * 6. Inline editing badge on double click.
 * 7. Midpoint quick-delete button on hover or selection.
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
  data,
}: EdgeProps) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const rawLabel = (data as { label?: string | null })?.label;
  const currentLabel = typeof rawLabel === "string" ? rawLabel : "";
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const isEditing = editingValue !== null;
  const labelText = editingValue ?? currentLabel;

  const reactFlow = useReactFlow();

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
    offset: 20,
  });

  const isVisible = Boolean(selected || isHovered);

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      reactFlow.deleteElements({ edges: [{ id }] });
    },
    [id, reactFlow],
  );

  const handleStartEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingValue(currentLabel);
    },
    [currentLabel],
  );

  const handleCommitEdit = useCallback(() => {
    const trimmed = (editingValue ?? "").trim();
    setEditingValue(null);
    if (trimmed !== currentLabel) {
      const onUpdate = (data as { onUpdateLabel?: (val: string) => void })
        ?.onUpdateLabel;
      if (typeof onUpdate === "function") {
        onUpdate(trimmed);
      }
    }
  }, [editingValue, currentLabel, data]);

  const handleCancelEdit = useCallback(() => {
    setEditingValue(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        handleCommitEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleCancelEdit();
      }
    },
    [handleCommitEdit, handleCancelEdit],
  );

  const markerColor = selected
    ? "hsl(var(--primary))"
    : isHovered
      ? "hsl(var(--foreground))"
      : undefined;

  const resolvedMarkerEnd = useMemo(() => {
    if (!markerEnd) return undefined;
    if (typeof markerEnd === "string") return markerEnd;
    const markerObj = markerEnd as EdgeMarker;
    return {
      ...markerObj,
      color: markerColor ?? markerObj.color,
    };
  }, [markerEnd, markerColor]);

  const mergedStyle = useMemo(
    () => ({
      ...style,
      stroke: markerColor,
      strokeWidth: selected || isHovered ? 2 : 1.5,
      transition: "stroke 150ms ease, stroke-width 150ms ease",
    }),
    [style, selected, isHovered, markerColor],
  );

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={resolvedMarkerEnd as unknown as string}
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
        onDoubleClick={handleStartEdit}
        data-testid={`workspace-edge-hitbox-${id}`}
      />

      {/* Feishu-style midpoint label badge & disconnect button */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            zIndex: 1000,
          }}
          className="nodrag nopan flex items-center gap-1.5 pointer-events-auto"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Editable or static label pill badge */}
          {isEditing ? (
            <input
              type="text"
              autoFocus
              value={labelText}
              onChange={(e) => setEditingValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleCommitEdit}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              className="h-6 min-w-[50px] max-w-[140px] rounded-full border border-primary bg-background px-2.5 text-xs font-medium text-foreground shadow-xs outline-none focus:ring-1 focus:ring-primary text-center"
              data-testid={`workspace-edge-label-input-${id}`}
            />
          ) : currentLabel ? (
            <div
              onDoubleClick={handleStartEdit}
              className={cn(
                "cursor-pointer select-none rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium shadow-xs transition-colors",
                selected || isHovered
                  ? "border-primary text-foreground shadow-sm"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-border",
              )}
              data-testid={`workspace-edge-label-${id}`}
              title={t("workspace.canvas.editEdgeLabel")}
            >
              {currentLabel}
            </div>
          ) : null}

          {/* Midpoint disconnect button */}
          <div
            className={cn(
              "transition-all duration-150",
              isVisible && !isEditing
                ? "opacity-100 scale-100 pointer-events-auto"
                : "opacity-0 scale-75 pointer-events-none",
            )}
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
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const workspaceEdgeTypes: EdgeTypes = {
  default: WorkspaceEdge,
};
