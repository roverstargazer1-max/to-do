"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Handle, Position, useNodeId, useStore } from "@xyflow/react";
import { X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { notify } from "@/lib/notify";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { nodeCommands } from "@/lib/commands/node";
import type { DecisionDisplayConfig } from "@/lib/types/workspace";
import { CardResizer } from "./CardResizer";
import type { WorkspaceNodeComponentProps } from "./node-registry";
import { cn } from "@/lib/utils";

/**
 * DecisionNode — native diamond-shaped conditional branching gate on the workspace canvas.
 *
 * Exists purely in workspace layout (entity_type: null, entity_id: null).
 * Features:
 * - Pure geometric diamond (rhombus) shape without rectangular card wrappers
 * - In-place editing of condition question via double-click
 * - Multi-directional connection ports directly at the 4 diamond apexes:
 *   - Input: Left ("in"), Top ("in-top"), Bottom ("in-bottom")
 *   - Output: Right ("out"), Top ("out-top"), Bottom ("out-bottom")
 * - Hover / selection floating delete button
 * - 8-direction resizing with CardResizer (min: 140px x 80px)
 */
export function DecisionNode({ id, data }: WorkspaceNodeComponentProps) {
  const { row } = data;
  const nodeId = useNodeId() ?? id;
  const isSelected = useStore(
    useCallback(
      (s) => (nodeId ? !!s.nodeLookup.get(nodeId)?.selected : false),
      [nodeId],
    ),
  );

  const queryClient = useQueryClient();
  const { isGuestMode } = useAuth();
  const { t } = useTranslation();

  const displayConfig = (row.display_config ??
    {}) as unknown as DecisionDisplayConfig;
  const currentQuestion = displayConfig.question ?? "";
  const currentDescription = displayConfig.description ?? "";

  const [isEditing, setIsEditing] = useState(
    () => !currentQuestion && !currentDescription,
  );
  const [draftQuestion, setDraftQuestion] = useState(currentQuestion);
  const inputRef = useRef<HTMLInputElement>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing) {
      setDraftQuestion(currentQuestion);
    }
  }, [currentQuestion, isEditing]);

  const commitQuestion = useCallback(async () => {
    setIsEditing(false);
    const trimmed = draftQuestion.trim();
    if (trimmed === currentQuestion) return;

    try {
      await nodeCommands.updateDecisionNode(
        { queryClient, isGuestMode },
        {
          workspaceId: row.workspace_id,
          nodeId: id,
          question: trimmed,
        },
      );
    } catch (err) {
      console.error("Failed to update decision node question:", err);
      notify.error(t("workspace.decisionNode.updateFailed"));
    }
  }, [
    draftQuestion,
    currentQuestion,
    queryClient,
    isGuestMode,
    row.workspace_id,
    id,
    t,
  ]);

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await nodeCommands.remove({ queryClient, isGuestMode }, row);
    } catch (err) {
      console.error("Failed to remove decision node:", err);
      notify.error(t("workspace.node.removeFailed"));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div
      data-testid="decision-node"
      className={cn(
        "group relative w-full h-full flex items-center justify-center select-none",
        "transition-shadow duration-200",
      )}
    >
      {/* SVG Diamond Outline & Fill */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <polygon
          points="50,0 100,50 50,100 0,50"
          className={cn("ws-decision-diamond", isSelected && "selected")}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Floating Hover/Selected Remove Button */}
      <button
        type="button"
        onClick={() => void handleRemove()}
        disabled={removing}
        data-testid="decision-node-remove"
        aria-label={t("workspace.decisionNode.removeAria")}
        className={cn(
          "nodrag absolute -top-1.5 -right-1.5 z-20 grid h-5 w-5 place-content-center rounded-full",
          "border border-border/80 bg-[hsl(var(--canvas-node,0_0%_100%))] text-muted-foreground shadow-xs",
          "transition-all duration-150 ease-seijaku hover:border-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-50",
          isSelected
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 focus:opacity-100",
        )}
      >
        <X className="h-3 w-3" strokeWidth={2.25} />
      </button>

      {/* Inscribed Diamond Content Zone */}
      <div className="relative z-10 w-[72%] max-h-[72%] min-h-0 flex flex-col items-center justify-center p-1 text-center pointer-events-auto overflow-hidden">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={draftQuestion}
            onChange={(e) => setDraftQuestion(e.target.value)}
            onBlur={() => void commitQuestion()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commitQuestion();
              } else if (e.key === "Escape") {
                setDraftQuestion(currentQuestion);
                setIsEditing(false);
              }
            }}
            placeholder={t("workspace.decisionNode.questionPlaceholder")}
            data-testid="decision-node-input"
            className="nodrag w-full bg-transparent text-center text-xs font-medium leading-tight text-foreground outline-none border-b border-primary/60 focus:border-primary p-0"
          />
        ) : (
          <div
            onDoubleClick={() => setIsEditing(true)}
            data-testid="decision-node-question"
            title={
              currentQuestion.trim() ||
              t("workspace.decisionNode.emptyQuestion")
            }
            className="nodrag nowheel nopan cursor-text select-text text-xs font-medium leading-tight text-foreground text-center break-words whitespace-pre-wrap hover:text-primary transition-colors overflow-y-auto max-h-full w-full"
          >
            {currentQuestion.trim() ||
              t("workspace.decisionNode.emptyQuestion")}
          </div>
        )}

        {currentDescription.trim() && !isEditing ? (
          <div
            data-testid="decision-node-description"
            className="nodrag nowheel nopan text-[10px] text-muted-foreground text-center mt-1 break-words whitespace-pre-wrap max-w-full overflow-y-auto"
          >
            {currentDescription}
          </div>
        ) : null}
      </div>

      {/* Resize Controls & Apex Connection Handles */}
      {nodeId ? (
        <>
          <CardResizer
            nodeId={nodeId}
            selected={isSelected}
            minWidth={160}
            minHeight={80}
          />
          {/* Left apex: Primary incoming port */}
          <Handle id="in" type="target" position={Position.Left} />

          {/* Right apex: Primary outgoing branch */}
          <Handle id="out" type="source" position={Position.Right} />

          {/* Top apex: Bi-directional port (incoming from above / outgoing branch) */}
          <Handle id="in-top" type="target" position={Position.Top} />
          <Handle id="out-top" type="source" position={Position.Top} />

          {/* Bottom apex: Bi-directional port (incoming from below / outgoing branch) */}
          <Handle id="in-bottom" type="target" position={Position.Bottom} />
          <Handle id="out-bottom" type="source" position={Position.Bottom} />
        </>
      ) : null}
    </div>
  );
}
