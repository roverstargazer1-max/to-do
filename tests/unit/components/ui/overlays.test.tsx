import { describe, expect, it } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { Sheet, SheetOverlay, SheetPortal } from "@/components/ui/sheet";
import { Drawer, DrawerOverlay, DrawerPortal } from "@/components/ui/drawer";
import {
  AlertDialog,
  AlertDialogOverlay,
  AlertDialogPortal,
} from "@/components/ui/alert-dialog";

describe("High-DPI visual compositing layer pruning on overlays", () => {
  it("renders DialogOverlay without static will-change class while retaining transitions", () => {
    const { getByTestId } = render(
      <Dialog open={true}>
        <DialogPortal>
          <DialogOverlay data-testid="dialog-overlay" />
        </DialogPortal>
      </Dialog>,
    );

    const overlay = getByTestId("dialog-overlay");
    expect(overlay.className).not.toContain("will-change");
    expect(overlay.className).toContain("backdrop-blur-sm");
    expect(overlay.className).toContain("fixed inset-0");
    expect(overlay.className).toContain("duration-200");
  });

  it("renders SheetOverlay without static will-change class while retaining transitions", () => {
    const { getByTestId } = render(
      <Sheet open={true}>
        <SheetPortal>
          <SheetOverlay data-testid="sheet-overlay" />
        </SheetPortal>
      </Sheet>,
    );

    const overlay = getByTestId("sheet-overlay");
    expect(overlay.className).not.toContain("will-change");
    expect(overlay.className).toContain("backdrop-blur-sm");
    expect(overlay.className).toContain("fixed inset-0");
    expect(overlay.className).toContain("duration-150");
  });

  it("renders DrawerOverlay without static will-change class while retaining transitions", () => {
    const { getByTestId } = render(
      <Drawer open={true}>
        <DrawerPortal>
          <DrawerOverlay data-testid="drawer-overlay" />
        </DrawerPortal>
      </Drawer>,
    );

    const overlay = getByTestId("drawer-overlay");
    expect(overlay.className).not.toContain("will-change");
    expect(overlay.className).toContain("backdrop-blur-sm");
    expect(overlay.className).toContain("fixed inset-0");
    expect(overlay.className).toContain("duration-150");
  });

  it("renders AlertDialogOverlay without static will-change class while retaining transitions", () => {
    const { getByTestId } = render(
      <AlertDialog open={true}>
        <AlertDialogPortal>
          <AlertDialogOverlay data-testid="alert-dialog-overlay" />
        </AlertDialogPortal>
      </AlertDialog>,
    );

    const overlay = getByTestId("alert-dialog-overlay");
    expect(overlay.className).not.toContain("will-change");
    expect(overlay.className).toContain("backdrop-blur-sm");
    expect(overlay.className).toContain("fixed inset-0");
    expect(overlay.className).toContain("duration-150");
  });
});
