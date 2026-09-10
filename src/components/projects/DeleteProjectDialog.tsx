"use client";

import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import {
  useArchiveProject,
  useMoveTasksToInbox,
  useDeleteProjectTasks,
  useHardDeleteProject,
} from "@/lib/hooks/useProjectMutations";
import type { Project } from "@/lib/types/task";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useEffect } from "react";
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
import { useBackNavigation } from "@/lib/hooks/useBackNavigation";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useState } from "react";
import { Loader2, Archive, Inbox, Trash2 } from "lucide-react";

interface DeleteProjectDialogProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ActiveAction = "keep" | "inbox" | "delete" | null;

export function DeleteProjectDialog({
  project,
  open,
  onOpenChange,
}: DeleteProjectDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { t } = useTranslation();
  const archiveProject = useArchiveProject();
  const moveTasksToInbox = useMoveTasksToInbox();
  const deleteProjectTasks = useDeleteProjectTasks();
  const hardDeleteProject = useHardDeleteProject();
  const { trigger } = useHaptic();

  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const isPending =
    archiveProject.isPending ||
    moveTasksToInbox.isPending ||
    deleteProjectTasks.isPending ||
    hardDeleteProject.isPending;

  // Handle back navigation on mobile to close drawer instead of navigating away
  useBackNavigation(open && !isDesktop, () => onOpenChange(false));

  // Haptic on open
  useEffect(() => {
    if (open) trigger("thud");
  }, [open, trigger]);

  // Reset activeAction when dialog closes or opens
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setActiveAction(null);
    }
  }

  // Close on success
  useEffect(() => {
    if (
      (archiveProject.isSuccess || hardDeleteProject.isSuccess) &&
      activeAction
    ) {
      onOpenChange(false);
    }
  }, [
    archiveProject.isSuccess,
    hardDeleteProject.isSuccess,
    activeAction,
    onOpenChange,
  ]);

  if (!project) return null;

  const handleKeepArchived = async () => {
    setActiveAction("keep");
    await archiveProject.mutateAsync(project.id);
    trigger("success");
  };

  const handleInbox = async () => {
    setActiveAction("inbox");
    await moveTasksToInbox.mutateAsync(project.id);
    await archiveProject.mutateAsync(project.id);
    trigger("success");
  };

  const handleDeleteAll = async () => {
    setActiveAction("delete");
    await deleteProjectTasks.mutateAsync(project.id);
    await hardDeleteProject.mutateAsync(project.id);
    trigger("success");
  };

  const description = t("common.dialog.deleteProjectDescription", {
    name: project.name,
  });

  if (isDesktop) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent aria-describedby="delete-project-description">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("common.sidebar.deleteProject")}
            </AlertDialogTitle>
            <AlertDialogDescription id="delete-project-description">
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
            <Button
              variant="outline"
              disabled={isPending}
              onClick={handleKeepArchived}
              className="gap-2"
            >
              {activeAction === "keep" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Archive
                  className="h-4 w-4 text-muted-foreground"
                  strokeWidth={2.25}
                />
              )}
              {t("common.dialog.keepArchived")}
            </Button>
            <Button
              variant="outline"
              disabled={isPending}
              onClick={handleInbox}
              className="gap-2"
            >
              {activeAction === "inbox" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Inbox
                  className="h-4 w-4 text-muted-foreground"
                  strokeWidth={2.25}
                />
              )}
              {t("common.dialog.moveToInbox")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAll}
              disabled={isPending}
              className="gap-2"
            >
              {activeAction === "delete" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" strokeWidth={2.25} />
              )}
              {t("common.dialog.delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>{t("common.sidebar.deleteProject")}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter className="pt-2">
          <Button
            onClick={handleDeleteAll}
            variant="destructive"
            className="w-full gap-3"
            disabled={isPending}
          >
            {activeAction === "delete" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" strokeWidth={2.25} />
            )}
            <span>{t("common.dialog.deleteAllTasks")}</span>
          </Button>
          <Button
            variant="outline"
            className="w-full gap-3"
            disabled={isPending}
            onClick={handleInbox}
          >
            {activeAction === "inbox" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Inbox
                className="h-4 w-4 text-muted-foreground"
                strokeWidth={2.25}
              />
            )}
            <span>{t("common.dialog.moveToInbox")}</span>
          </Button>
          <Button
            variant="outline"
            className="w-full gap-3"
            disabled={isPending}
            onClick={handleKeepArchived}
          >
            {activeAction === "keep" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Archive
                className="h-4 w-4 text-muted-foreground"
                strokeWidth={2.25}
              />
            )}
            <span>{t("common.dialog.keepArchived")}</span>
          </Button>
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
