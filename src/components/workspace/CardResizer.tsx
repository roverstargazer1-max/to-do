"use client";

import { memo, useCallback } from "react";
import {
  NodeResizeControl,
  ResizeControlVariant,
  useStore,
  type ControlPosition,
  type ControlLinePosition,
} from "@xyflow/react";
import { cn } from "@/lib/utils";

export interface CardResizerProps {
  nodeId: string;
  selected?: boolean;
  minWidth?: number;
  minHeight?: number;
}

const CARD_CORNER_POSITIONS: ControlPosition[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

const CARD_EDGE_POSITIONS: ControlPosition[] = ["top", "bottom"];

const CARD_LINE_POSITIONS: ControlLinePosition[] = [
  "top",
  "bottom",
  "left",
  "right",
];

/**
 * CardResizer — 8-direction resize controls for individual node cards.
 *
 * Renders:
 * - 4 corner handles for diagonal resizing
 * - 2 edge pill handles (top and bottom) for intuitive vertical height adjustment
 * - 4 perimeter lines for comfortable edge dragging
 *
 * Left and right edges have no pill handles to avoid colliding with
 * connection ports (Handles), but their lines provide full-height grab zones.
 */
export const CardResizer = memo(function CardResizer({
  nodeId,
  selected,
  minWidth = 200,
  minHeight = 48,
}: CardResizerProps) {
  const storeSelected = useStore(
    useCallback(
      (s) => (nodeId ? !!s.nodeLookup.get(nodeId)?.selected : false),
      [nodeId],
    ),
  );
  const isVisible = selected ?? storeSelected;

  if (!isVisible) {
    return null;
  }

  return (
    <>
      {CARD_LINE_POSITIONS.map((pos) => (
        <NodeResizeControl
          key={`line-${pos}`}
          nodeId={nodeId}
          position={pos}
          variant={ResizeControlVariant.Line}
          minWidth={minWidth}
          minHeight={minHeight}
          className={cn("ws-card-resize-line", pos)}
        />
      ))}

      {CARD_CORNER_POSITIONS.map((pos) => (
        <NodeResizeControl
          key={`corner-${pos}`}
          nodeId={nodeId}
          position={pos}
          minWidth={minWidth}
          minHeight={minHeight}
          className={cn(
            "ws-card-resize-handle ws-card-resize-handle--corner",
            pos,
          )}
        />
      ))}

      {CARD_EDGE_POSITIONS.map((pos) => (
        <NodeResizeControl
          key={`edge-${pos}`}
          nodeId={nodeId}
          position={pos}
          minWidth={minWidth}
          minHeight={minHeight}
          className={cn(
            "ws-card-resize-handle ws-card-resize-handle--edge",
            pos,
          )}
        />
      ))}
    </>
  );
});
