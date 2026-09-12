"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Calendar,
  CheckSquare,
  Maximize2,
  Plus,
  Repeat,
  Timer,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n/useTranslation";

export interface QuickAddMenuProps {
  open: boolean;
  anchor: { x: number; y: number } | null;
  onClose: () => void;
  onQuickCreateTask: (title: string) => void | Promise<void>;
  onPickExistingTask: () => void;
  onAddHabit: () => void;
  onAddEvent: () => void;
  onAddFocus: () => void;
  onFitView?: () => void;
}

export function QuickAddMenu({
  open,
  anchor,
  onClose,
  onQuickCreateTask,
  onPickExistingTask,
  onAddHabit,
  onAddEvent,
  onAddFocus,
  onFitView,
}: QuickAddMenuProps) {
  const { t } = useTranslation();
  const [taskTitle, setTaskTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const firstItemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      // Small delay to ensure Radix content is mounted and input gets focus
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const handleInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const trimmed = taskTitle.trim();
        if (trimmed) {
          onQuickCreateTask(trimmed);
          setTaskTitle("");
          onClose();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown" || e.key === "Tab") {
        e.preventDefault();
        firstItemRef.current?.focus();
      }
    },
    [taskTitle, onQuickCreateTask, onClose],
  );

  const handleFirstItemKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    },
    [],
  );

  if (!anchor) return null;

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setTaskTitle("");
          onClose();
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <div
          data-testid="quick-add-menu-anchor"
          style={{
            position: "fixed",
            left: `${anchor.x}px`,
            top: `${anchor.y}px`,
            width: "1px",
            height: "1px",
            pointerEvents: "none",
            visibility: "hidden",
          }}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={4}
        collisionPadding={16}
        data-testid="quick-add-menu"
        className="w-64 p-1 shadow-lg"
      >
        {/* Instant Task Creation Input */}
        <div className="p-1">
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-muted/50 border border-border/50 focus-within:border-foreground/30 focus-within:bg-background transition-colors">
            <Plus
              className="h-3.5 w-3.5 text-muted-foreground shrink-0"
              strokeWidth={2.25}
            />
            <input
              ref={inputRef}
              type="text"
              data-testid="quick-add-task-input"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={t("workspace.canvas.quickTaskPlaceholder")}
              className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>
        </div>

        <DropdownMenuSeparator className="my-1" />

        {/* Action Items */}
        <DropdownMenuItem
          ref={firstItemRef}
          data-testid="quick-add-pick-task"
          onClick={() => {
            onPickExistingTask();
            onClose();
          }}
          onKeyDown={handleFirstItemKeyDown}
          className="gap-2.5 text-xs cursor-pointer"
        >
          <CheckSquare
            className="h-4 w-4 text-muted-foreground"
            strokeWidth={2.25}
          />
          <span>{t("workspace.canvas.pickExistingTask")}</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          data-testid="quick-add-habit"
          onClick={() => {
            onAddHabit();
            onClose();
          }}
          className="gap-2.5 text-xs cursor-pointer"
        >
          <Repeat
            className="h-4 w-4 text-muted-foreground"
            strokeWidth={2.25}
          />
          <span>{t("workspace.canvas.addHabit")}</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          data-testid="quick-add-event"
          onClick={() => {
            onAddEvent();
            onClose();
          }}
          className="gap-2.5 text-xs cursor-pointer"
        >
          <Calendar
            className="h-4 w-4 text-muted-foreground"
            strokeWidth={2.25}
          />
          <span>{t("workspace.canvas.addEvent")}</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          data-testid="quick-add-focus"
          onClick={() => {
            onAddFocus();
            onClose();
          }}
          className="gap-2.5 text-xs cursor-pointer"
        >
          <Timer className="h-4 w-4 text-muted-foreground" strokeWidth={2.25} />
          <span>{t("workspace.canvas.addFocus")}</span>
        </DropdownMenuItem>

        {onFitView ? (
          <>
            <DropdownMenuSeparator className="my-1" />
            <DropdownMenuItem
              data-testid="quick-add-fit-view"
              onClick={() => {
                onFitView();
                onClose();
              }}
              className="gap-2.5 text-xs cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <Maximize2 className="h-4 w-4" strokeWidth={2.25} />
              <span>{t("workspace.canvas.fitView")}</span>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
