"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  isValidElement,
  memo,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, Pencil, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { notify } from "@/lib/notify";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { nodeCommands } from "@/lib/commands/node";
import type { DocDisplayConfig } from "@/lib/types/workspace";
import { NodeCard } from "./NodeCard";
import type { WorkspaceNodeComponentProps } from "./node-registry";
import { MermaidDiagram } from "./MermaidDiagram";

/**
 * DocNode — a standalone markdown & text document card on the workspace canvas.
 *
 * Exists purely in workspace layout (entity_type: null, entity_id: null).
 * Supports:
 * - In-place Markdown preview / text editing toggle
 * - Auto-focus edit on newly placed nodes
 * - One-click prompt copying with visual check feedback & toast
 * - Double-click title editing in the card header
 * - 8-direction resizing via NodeCard's CardResizer
 */
export const DocNode = memo(function DocNode({
  id,
  data,
  selected,
}: WorkspaceNodeComponentProps) {
  const { row } = data;
  const queryClient = useQueryClient();
  const { isGuestMode } = useAuth();
  const { t } = useTranslation();

  const displayConfig = (row.display_config ?? {}) as DocDisplayConfig;
  const currentTitle = displayConfig.title ?? "";
  const currentContent = displayConfig.content ?? "";

  // Content edit state: default to edit mode if both content and title are empty (brand new node)
  const [isEditingContent, setIsEditingContent] = useState(
    () => !currentContent && !currentTitle,
  );
  const [draftContent, setDraftContent] = useState(currentContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Title edit state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(currentTitle);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Copy feedback and removal state
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState(false);

  // Focus textarea when entering content edit mode
  useEffect(() => {
    if (isEditingContent && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditingContent]);

  // Sync draftContent when currentContent changes externally and not editing
  useEffect(() => {
    if (!isEditingContent) {
      setDraftContent(currentContent);
    }
  }, [currentContent, isEditingContent]);

  // Focus and select title input when entering title edit mode
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // Sync draftTitle when currentTitle changes externally and not editing
  useEffect(() => {
    if (!isEditingTitle) {
      setDraftTitle(currentTitle);
    }
  }, [currentTitle, isEditingTitle]);

  const commitTitle = useCallback(async () => {
    setIsEditingTitle(false);
    const trimmed = draftTitle.trim();
    if (trimmed === currentTitle) return;

    try {
      await nodeCommands.updateDocNode(
        { queryClient, isGuestMode },
        {
          workspaceId: row.workspace_id,
          nodeId: id,
          title: trimmed,
        },
      );
    } catch (err) {
      console.error("Failed to update doc title:", err);
      notify.error(t("workspace.canvas.docAddFailed"));
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

  const commitContent = useCallback(async () => {
    setIsEditingContent(false);
    if (draftContent === currentContent) return;

    try {
      await nodeCommands.updateDocNode(
        { queryClient, isGuestMode },
        {
          workspaceId: row.workspace_id,
          nodeId: id,
          content: draftContent,
        },
      );
    } catch (err) {
      console.error("Failed to update doc content:", err);
      notify.error(t("workspace.canvas.docAddFailed"));
    }
  }, [
    draftContent,
    currentContent,
    queryClient,
    isGuestMode,
    row.workspace_id,
    id,
    t,
  ]);

  const handleCopy = async () => {
    const textToCopy = isEditingContent ? draftContent : currentContent;
    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      notify(t("workspace.docNode.copySuccess"));
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy doc text:", err);
      notify.error(t("workspace.docNode.copyFailed"));
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await nodeCommands.remove({ queryClient, isGuestMode }, row);
    } catch (err) {
      console.error("Failed to remove doc node:", err);
      notify.error(t("workspace.node.removeFailed"));
    } finally {
      setRemoving(false);
    }
  };

  const titleElement: ReactNode = isEditingTitle ? (
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
      placeholder={t("workspace.docNode.titlePlaceholder")}
      data-testid="doc-node-title-input"
      className="nodrag w-28 bg-transparent text-[10px] font-medium uppercase tracking-wider text-foreground outline-none border-b border-border/80 focus:border-foreground py-0 px-0"
    />
  ) : (
    <span
      onDoubleClick={() => setIsEditingTitle(true)}
      data-testid="doc-node-title"
      title={t("workspace.group.renameHint")}
      className="cursor-text select-text"
    >
      {currentTitle.trim() || t("workspace.node.kindDoc")}
    </span>
  );

  const headerActions = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => void handleCopy()}
        data-testid="doc-node-copy"
        aria-label={t("workspace.docNode.copyAria")}
        className="nodrag grid h-4 w-4 place-content-center rounded-[3px] text-muted-foreground transition-colors duration-200 ease-seijaku hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        {copied ? (
          <Check className="h-3 w-3 text-emerald-500" strokeWidth={2.25} />
        ) : (
          <Copy className="h-3 w-3" strokeWidth={2.25} />
        )}
      </button>

      <button
        type="button"
        onClick={() => {
          if (isEditingContent) {
            void commitContent();
          } else {
            setIsEditingContent(true);
          }
        }}
        data-testid="doc-node-toggle-edit"
        aria-label={
          isEditingContent
            ? t("workspace.docNode.previewAria")
            : t("workspace.docNode.editAria")
        }
        className="nodrag grid h-4 w-4 place-content-center rounded-[3px] text-muted-foreground transition-colors duration-200 ease-seijaku hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        {isEditingContent ? (
          <Check className="h-3 w-3" strokeWidth={2.25} />
        ) : (
          <Pencil className="h-3 w-3" strokeWidth={2.25} />
        )}
      </button>

      <button
        type="button"
        onClick={() => void handleRemove()}
        disabled={removing}
        data-testid="doc-node-remove"
        aria-label={t("workspace.node.removeDocAria")}
        className="nodrag grid h-4 w-4 place-content-center rounded-[3px] text-muted-foreground transition-colors duration-200 ease-seijaku hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <X className="h-3 w-3" strokeWidth={2.25} />
      </button>
    </div>
  );

  return (
    <div data-testid="doc-node" className="relative w-full h-full">
      <NodeCard
        kind={titleElement}
        action={headerActions}
        minWidth={200}
        minHeight={120}
        selected={selected}
      >
        <div className="relative w-full h-full min-h-0 flex-1 flex flex-col overflow-hidden">
          {isEditingContent ? (
            <textarea
              ref={textareaRef}
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              onBlur={() => void commitContent()}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void commitContent();
                }
              }}
              placeholder={t("workspace.docNode.placeholder")}
              data-testid="doc-node-textarea"
              className="nodrag nowheel nopan flex-1 min-h-0 w-full h-full p-2.5 bg-transparent resize-none outline-none text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/60 font-sans"
            />
          ) : (
            <div
              onDoubleClick={() => setIsEditingContent(true)}
              data-testid="doc-node-preview"
              className="nodrag nowheel nopan flex-1 min-h-0 w-full h-full max-h-[480px] p-2.5 overflow-y-auto cursor-text select-text text-xs leading-relaxed text-foreground"
            >
              {currentContent.trim() ? (
                <div className="prose prose-xs dark:prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_pre]:my-2 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_pre_code]:p-0">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code(props) {
                        const { className, children, ...rest } = props;
                        const match = /language-(\w+)/.exec(className || "");
                        if (match && match[1] === "mermaid") {
                          return (
                            <MermaidDiagram
                              chart={String(children).replace(/\n$/, "")}
                            />
                          );
                        }
                        return (
                          <code className={className} {...rest}>
                            {children}
                          </code>
                        );
                      },
                      pre(props) {
                        const { children, ...rest } = props;
                        if (
                          isValidElement(children) &&
                          typeof children.props === "object" &&
                          children.props !== null &&
                          "className" in children.props &&
                          typeof (children.props as { className?: string })
                            .className === "string" &&
                          (
                            children.props as { className?: string }
                          ).className?.includes("language-mermaid")
                        ) {
                          return <>{children}</>;
                        }
                        return <pre {...rest}>{children}</pre>;
                      },
                    }}
                  >
                    {currentContent}
                  </ReactMarkdown>
                </div>
              ) : (
                <span className="text-muted-foreground/60 italic text-xs">
                  {t("workspace.docNode.emptyPreview")}
                </span>
              )}
            </div>
          )}
        </div>
      </NodeCard>
    </div>
  );
});
