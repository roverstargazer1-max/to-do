"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Send, Trash2, Loader2, Palette } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { notify } from "@/lib/notify";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { cn } from "@/lib/utils";
import { workspaceCommands } from "@/lib/commands/workspace";
import { useWorkspaceViewportStore } from "@/lib/store/workspaceViewportStore";
import { useWorkspaces } from "@/lib/hooks/useWorkspaces";
import { useWorkspaceActions } from "@/components/workspace/WorkspaceActionsProvider";
import { ColorPicker } from "@/components/shared/ColorPicker";
import { IconCell } from "@/components/ui/IconCell";
import { DEFAULT_PROJECT_COLOR } from "@/lib/constants/colors";
import type { Workspace } from "@/lib/types/workspace";

/** Shared command context for the dialog command calls. */
function useWorkspaceCommandContext() {
  const queryClient = useQueryClient();
  const { isGuestMode } = useAuth();
  return { queryClient, isGuestMode };
}

function WorkspaceNameForm({
  initialValue,
  initialColor = DEFAULT_PROJECT_COLOR,
  placeholder,
  submitLabel,
  onSubmit,
  pending,
}: {
  initialValue: string;
  initialColor?: string;
  placeholder: string;
  submitLabel: string;
  onSubmit: (name: string, color: string) => void;
  pending: boolean;
}) {
  const [name, setName] = useState(initialValue);
  const [color, setColor] = useState(initialColor);
  const { t } = useTranslation();
  const { trigger } = useHaptic();
  const isFinePointer = useMediaQuery("(pointer: fine)");

  const trimmed = name.trim();
  const isValid = trimmed.length > 0 && trimmed.length <= 200;

  const submit = () => {
    if (!isValid || pending) return;
    trigger("thud");
    onSubmit(trimmed, color);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col h-auto max-h-[90dvh]"
    >
      <ResponsiveDialogHeader className="sr-only">
        <ResponsiveDialogTitle>{submitLabel}</ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          {t("workspace.dialog.nameDescription")}
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>

      {/* Title — native input, bottom border only, no box (project dialog pattern) */}
      <div className="px-5 pt-5 pb-4 border-b border-border/40 shrink-0">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label={t("workspace.dialog.nameAria")}
          placeholder={placeholder}
          autoFocus={isFinePointer}
          maxLength={200}
          className="w-full text-xl font-semibold tracking-tight bg-transparent border-0 outline-none placeholder:text-muted-foreground text-foreground"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
      </div>

      {/* Body — Color Picker matching CreateProjectDialog */}
      <div className="flex-1 overflow-y-auto min-h-0 py-2">
        <div className="flex items-start gap-3 px-3 py-2.5 rounded-md mx-2">
          <IconCell>
            <Palette
              className="h-4 w-4 text-muted-foreground"
              strokeWidth={2.25}
            />
          </IconCell>
          <div className="flex-1 min-w-0">
            <ColorPicker
              value={color}
              onChange={(newColor) => setColor(newColor)}
              ariaLabel={t("workspace.dialog.colorLabel")}
            />
          </div>
        </div>

        <div className="h-1" />
      </div>

      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-t border-border/40 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-background w-full max-w-full">
        <div className="flex-1" />
        <Button
          type="submit"
          size="sm"
          className="h-9 w-9 p-0 rounded-lg bg-brand hover:bg-brand/90 text-brand-foreground shadow-sm shadow-brand/10 transition-seijaku flex items-center justify-center"
          disabled={!isValid || pending}
          aria-label={submitLabel}
        >
          {pending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5 stroke-[2.25px]" />
          )}
        </Button>
      </div>
    </form>
  );
}

function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const ctx = useWorkspaceCommandContext();
  const { t } = useTranslation();

  const [pending, setPending] = useState(false);

  const handleCreate = async (name: string, color: string) => {
    setPending(true);
    try {
      const workspace = await workspaceCommands.create(ctx, { name, color });
      notify(t("workspace.dialog.created"));
      onOpenChange(false);
      router.push(`/workspaces/${workspace.id}`);
    } catch (err) {
      console.error("Failed to create workspace:", err);
      notify.error(t("workspace.dialog.createFailed"));
    } finally {
      setPending(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[400px] p-0 overflow-hidden">
        <WorkspaceNameForm
          key={open ? "create-open" : "create-closed"}
          initialValue=""
          placeholder={t("workspace.dialog.createPlaceholder")}
          submitLabel={t("workspace.dialog.createTitle")}
          onSubmit={handleCreate}
          pending={pending}
        />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function RenameWorkspaceDialog({
  workspace,
  open,
  onOpenChange,
}: {
  workspace: Workspace | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const ctx = useWorkspaceCommandContext();
  const { data: workspaces } = useWorkspaces();
  const { t } = useTranslation();

  const [pending, setPending] = useState(false);

  // Re-resolve the freshest row so the rename lands even if the list was
  // invalidated in place (the name typed is authoritative, the id is not).
  const current = workspaces?.find((w) => w.id === workspace?.id) ?? workspace;

  const handleRename = async (name: string, color: string) => {
    if (!current) return;
    setPending(true);
    try {
      await workspaceCommands.rename(ctx, current.id, name, color);
      notify(t("workspace.dialog.renamed"));
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to rename workspace:", err);
      notify.error(t("workspace.dialog.renameFailed"));
    } finally {
      setPending(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[400px] p-0 overflow-hidden">
        <WorkspaceNameForm
          key={current?.id ?? "none"}
          initialValue={current?.name ?? ""}
          initialColor={current?.color ?? DEFAULT_PROJECT_COLOR}
          placeholder={t("workspace.dialog.renamePlaceholder")}
          submitLabel={t("workspace.dialog.renameTitle")}
          onSubmit={handleRename}
          pending={pending}
        />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function DeleteWorkspaceDialog({
  workspace,
  open,
  onOpenChange,
}: {
  workspace: Workspace | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const ctx = useWorkspaceCommandContext();
  const router = useRouter();
  const { trigger } = useHaptic();
  const { t } = useTranslation();
  const forgetViewport = useWorkspaceViewportStore(
    (state) => state.forgetWorkspace,
  );
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) trigger("thud");
  }, [open, trigger]);

  if (!workspace) return null;

  const handleDelete = async () => {
    setPending(true);
    try {
      await workspaceCommands.delete(ctx, workspace.id);
      // Device-local viewport for a dead workspace must not linger.
      forgetViewport(workspace.id);
      trigger("thud");
      notify(t("workspace.dialog.deleted"));
      onOpenChange(false);
      if (window.location.pathname === `/workspaces/${workspace.id}`) {
        router.replace("/workspaces");
      }
    } catch (err) {
      console.error("Failed to delete workspace:", err);
      notify.error(t("workspace.dialog.deleteFailed"));
    } finally {
      setPending(false);
    }
  };

  const description = t("workspace.dialog.deleteDescription", {
    name: workspace.name,
  });

  const deleteButton = (
    <Button
      variant="destructive"
      onClick={handleDelete}
      disabled={pending}
      className={cn("gap-2", !isDesktop && "w-full gap-3")}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" strokeWidth={2.25} />
      )}
      {t("workspace.dialog.delete")}
    </Button>
  );

  if (isDesktop) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent aria-describedby="delete-workspace-description">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("workspace.dialog.deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription id="delete-workspace-description">
              {description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                trigger("tick");
                onOpenChange(false);
              }}
            >
              {t("common.cancel")}
            </AlertDialogCancel>
            {deleteButton}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>{t("workspace.dialog.deleteTitle")}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter className="pt-2">
          {deleteButton}
          <DrawerClose asChild>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => trigger("tick")}
            >
              {t("common.cancel")}
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * Renders workspace dialogs at app level based on WorkspaceActionsProvider
 * state — the ProjectDialogs convention. Must be rendered inside
 * WorkspaceActionsProvider.
 */
export function WorkspaceDialogs() {
  const {
    isCreateWorkspaceOpen,
    closeCreateWorkspace,
    activeWorkspace,
    actionType,
    closeWorkspaceAction,
  } = useWorkspaceActions();

  return (
    <>
      <CreateWorkspaceDialog
        open={isCreateWorkspaceOpen}
        onOpenChange={(open) => {
          if (!open) closeCreateWorkspace();
        }}
      />
      <RenameWorkspaceDialog
        workspace={actionType === "rename" ? activeWorkspace : null}
        open={actionType === "rename" && activeWorkspace !== null}
        onOpenChange={(open) => {
          if (!open) closeWorkspaceAction();
        }}
      />
      <DeleteWorkspaceDialog
        workspace={actionType === "delete" ? activeWorkspace : null}
        open={actionType === "delete" && activeWorkspace !== null}
        onOpenChange={(open) => {
          if (!open) closeWorkspaceAction();
        }}
      />
    </>
  );
}
