"use client";

import type { ReactNode } from "react";
import { Handle, Position, useNodeId } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { CardResizer } from "./CardResizer";

/**
 * The shared node card — the single surface every kind renders through.
 *
 * Before this, a node was a bare `<div>` whose fill was the page fill: a
 * colourless, borderless block of text floating on a dotted sheet (the
 * reported bug). The card answers that structurally: a stepped-up surface
 * (`--canvas-node`) enclosed by a 1px ink hairline, a mono micro-header
 * (kind dot · uppercase kind label · the node's own control) over the
 * kind's body, and a punched connector port on each side.
 *
 * The head is KRNL0's node head (`frontend/reference/KRNL0` — mono,
 * letter-spaced, hairline-separated, action at the right) re-expressed in
 * this house's monochrome ink rather than KRNL0's accent palette.
 *
 * Ports render **only inside a React Flow host**: `useNodeId()` returns null
 * when a node component is rendered standalone (unit tests, docs), and React
 * Flow's `Handle` throws without its store. A standalone render is therefore
 * port-free and structurally unchanged.
 */
export interface NodeCardProps {
  /** The kind's display name or header element. */
  kind: ReactNode;
  /** The node's own affordances, rendered at the head's right edge. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  selected?: boolean;
  minWidth?: number;
  minHeight?: number;
}

export function NodeCard({
  kind,
  action,
  children,
  className,
  selected,
  minWidth = 200,
  minHeight = 48,
}: NodeCardProps) {
  const nodeId = useNodeId();

  return (
    <div className={cn("ws-node-card", className)}>
      <div className="ws-node-card__head">
        <span className="ws-node-card__dot" aria-hidden="true" />
        <span className="ws-node-card__kind">{kind}</span>
        <span className="ws-node-card__spacer" />
        {action}
      </div>

      <div className="ws-node-card__body">{children}</div>

      {nodeId ? (
        <>
          <CardResizer
            nodeId={nodeId}
            selected={selected}
            minWidth={minWidth}
            minHeight={minHeight}
          />
          {/* One port per side, in Strict connection mode: a connection runs
              out of a right port into a left one — whichever end the drag
              started from, React Flow normalises the direction, so the
              arrangement keeps reading left → right. */}
          <Handle id="out" type="source" position={Position.Right} />
          <Handle id="in" type="target" position={Position.Left} />
        </>
      ) : null}
    </div>
  );
}
