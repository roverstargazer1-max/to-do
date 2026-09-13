"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { Workflow, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { notify } from "@/lib/notify";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { nodeCommands } from "@/lib/commands/node";
import type { StepDisplayConfig } from "@/lib/types/workspace";
import { NodeCard } from "./NodeCard";
import type { WorkspaceNodeComponentProps } from "./node-registry";

/**
 * StepNode — a lightweight procedural step card on the workspace canvas.
 *
 * Exists purely in workspace layout (entity_type: null, entity_id: null).
 * Features:
 * - Procedural action or stage description without personal task checkboxes
 * - In-place title and notes editing
 * - Standard Left (in) and Right (out) ports
 * - 8-direction resizing with CardResizer (min: 180px x 60px)
 */
export function StepNode({ id, data }: WorkspaceNodeComponentProps) {
  const { row } = data;
  const queryClient = useQueryClient();
  const { isGuestMode } = useAuth();
  const { t } = useTranslation();

  const displayConfig = (row.display_config ??
    {}) as unknown as StepDisplayConfig;
  const currentTitle = displayConfig.title ?? "";
  const currentDescription = displayConfig.description ?? "";

  const [isEditingTitle, setIsEditingTitle] = useState(
    () => !currentTitle && !currentDescription,
  );
  const [draftTitle, setDraftTitle] = useState(currentTitle);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [draftDesc, setDraftDesc] = useState(currentDescription);
  const descInputRef = useRef<HTMLInputElement>(null);

  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    if (!isEditingTitle) {
      setDraftTitle(currentTitle);
    }
  }, [currentTitle, isEditingTitle]);

  useEffect(() => {
    if (isEditingDesc && descInputRef.current) {
      descInputRef.current.focus();
    }
  }, [isEditingDesc]);

  useEffect(() => {
    if (!isEditingDesc) {
      setDraftDesc(currentDescription);
    }
  }, [currentDescription, isEditingDesc]);

  const commitTitle = useCallback(async () => {
    setIsEditingTitle(false);
    const trimmed = draftTitle.trim();
    if (trimmed === currentTitle) return;

    try {
      await nodeCommands.updateStepNode(
        { queryClient, isGuestMode },
        {
          workspaceId: row.workspace_id,
          nodeId: id,
          title: trimmed,
        },
      );
    } catch (err) {
      console.error("Failed to update step node title:", err);
      notify.error(t("workspace.stepNode.updateFailed"));
    }
  }, [
    draftTitle,
    currentTitle,
    queryClient,
    isGuestMode,
    row.workspace_id,
    id,
    t,
  ]);

  const commitDesc = useCallback(async () => {
    setIsEditingDesc(false);
    const trimmed = draftDesc.trim();
    if (trimmed === currentDescription) return;

    try {
      await nodeCommands.updateStepNode(
        { queryClient, isGuestMode },
        {
          workspaceId: row.workspace_id,
          nodeId: id,
          description: trimmed,
        },
      );
    } catch (err) {
      console.error("Failed to update step node description:", err);
      notify.error(t("workspace.stepNode.updateFailed"));
    }
  }, [
    draftDesc,
    currentDescription,
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
      console.error("Failed to remove step node:", err);
      notify.error(t("workspace.node.removeFailed"));
    } finally {
      setRemoving(false);
    }
  };

  const headerActions = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => void handleRemove()}
        disabled={removing}
        data-testid="step-node-remove"
        aria-label={t("workspace.stepNode.removeAria")}
        className="nodrag grid h-4 w-4 place-content-center rounded-[3px] text-muted-foreground transition-colors duration-200 ease-seijaku hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <X className="h-3 w-3" strokeWidth={2.25} />
      </button>
    </div>
  );

  const titleElement: ReactNode = (
    <div className="flex items-center gap-1.5">
      <Workflow className="h-3 w-3 text-muted-foreground" />
      <span>{t("workspace.node.kindStep")}</span>
    </div>
  );

  return (
    <div data-testid="step-node" className="relative w-full h-full">
      <NodeCard
        kind={titleElement}
        action={headerActions}
        minWidth={180}
        minHeight={60}
        className="ws-node-card--step border-border hover:border-foreground/30 transition-colors"
      >
        <div className="relative w-full h-full min-h-[48px] flex-1 flex flex-col justify-center p-2.5 gap-1">
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={() => void commitTitle()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitTitle();
                } else if (e.key === "Escape") {
                  setDraftTitle(currentTitle);
                  setIsEditingTitle(false);
                }
              }}
              placeholder={t("workspace.stepNode.titlePlaceholder")}
              data-testid="step-node-input"
              className="nodrag w-full bg-transparent text-xs font-medium text-foreground outline-none border-b border-primary py-0.5 px-0"
            />
          ) : (
            <div
              onDoubleClick={() => setIsEditingTitle(true)}
              data-testid="step-node-title"
              title={t("workspace.stepNode.editHint")}
              className="nodrag cursor-text select-text text-xs font-medium text-foreground line-clamp-2 hover:text-primary transition-colors"
            >
              {currentTitle.trim() || t("workspace.stepNode.emptyTitle")}
            </div>
          )}

          {isEditingDesc ? (
            <input
              ref={descInputRef}
              type="text"
              value={draftDesc}
              onChange={(e) => setDraftDesc(e.target.value)}
              onBlur={() => void commitDesc()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitDesc();
                } else if (e.key === "Escape") {
                  setDraftDesc(currentDescription);
                  setIsEditingDesc(false);
                }
              }}
              placeholder={t("workspace.stepNode.descPlaceholder")}
              data-testid="step-node-desc-input"
              className="nodrag w-full bg-transparent text-[11px] text-muted-foreground outline-none border-b border-border py-0.5 px-0"
            />
          ) : currentDescription.trim() ? (
            <div
              onDoubleClick={() => setIsEditingDesc(true)}
              data-testid="step-node-description"
              className="nodrag cursor-text select-text text-[11px] text-muted-foreground line-clamp-2"
            >
              {currentDescription}
            </div>
          ) : null}
        </div>
      </NodeCard>
    </div>
  );
}
