"use client";

import React from "react";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import {
  AlertDialog,
  AlertDialogAction,
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
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useBackNavigation } from "@/lib/hooks/useBackNavigation";
import { useTranslation } from "@/lib/i18n/useTranslation";

interface DeleteConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
}

export function DeleteConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
}: DeleteConfirmationDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { trigger } = useHaptic();
  const { t } = useTranslation();

  const resolvedTitle = title ?? t("common.dialog.deleteTitle");
  const resolvedDescription =
    description ?? t("common.dialog.deleteDescription");
  const resolvedConfirmLabel = confirmLabel ?? t("common.dialog.delete");

  // Handle back navigation on mobile to close drawer instead of navigating away
  useBackNavigation(isOpen && !isDesktop, onClose);

  const handleConfirm = () => {
    trigger("thud");
    onConfirm();
    onClose();
  };

  const handleCancel = () => {
    trigger("tick");
    onClose();
  };

  if (isDesktop) {
    return (
      <AlertDialog open={isOpen} onOpenChange={onClose}>
        <AlertDialogContent aria-describedby="delete-dialog-description">
          <AlertDialogHeader>
            <AlertDialogTitle>{resolvedTitle}</AlertDialogTitle>
            <AlertDialogDescription id="delete-dialog-description">
              {resolvedDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirm}
              className="px-6"
            >
              {resolvedConfirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Drawer open={isOpen} onOpenChange={onClose} repositionInputs={false}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>{resolvedTitle}</DrawerTitle>
          <DrawerDescription>{resolvedDescription}</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter className="pt-2">
          <Button
            onClick={handleConfirm}
            variant="destructive"
            className="w-full"
          >
            {resolvedConfirmLabel}
          </Button>
          <DrawerClose asChild>
            <Button variant="outline" className="w-full" onClick={handleCancel}>
              {t("common.cancel")}
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
