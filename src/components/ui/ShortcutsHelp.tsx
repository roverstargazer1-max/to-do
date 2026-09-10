"use client";

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import { Keyboard } from "lucide-react";
import { getPlatformKey } from "@/lib/utils/platform";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { TranslationKey } from "@/lib/i18n/dictionaries/en";

interface Shortcut {
  keys: string[];
  descriptionKey: TranslationKey;
  // How the keys combine. Omit for a chord (press together, e.g. ⌘+B).
  // "alt": either key works (e.g. j/↓). "sequence": pressed one after another (e.g. g g).
  keyRelation?: "alt" | "sequence";
}

interface ShortcutGroup {
  titleKey: TranslationKey;
  shortcuts: Shortcut[];
}

const keyConnector: Record<
  NonNullable<Shortcut["keyRelation"]> | "chord",
  string | null
> = {
  chord: "+",
  alt: "/",
  sequence: null,
};

const getShortcuts = (
  platformKey: string,
  isBoardViewOnTasks: boolean,
): ShortcutGroup[] => [
  {
    titleKey: "shortcuts.groupNavigation",
    shortcuts: [
      { keys: ["1"], descriptionKey: "shortcuts.goToTasks" },
      { keys: ["2"], descriptionKey: "shortcuts.goToHabits" },
      { keys: ["3"], descriptionKey: "shortcuts.goToCalendar" },
      { keys: ["4"], descriptionKey: "shortcuts.goToStats" },
      { keys: ["5"], descriptionKey: "shortcuts.goToFocus" },
      { keys: ["6"], descriptionKey: "shortcuts.goToSettings" },
      { keys: [platformKey, "b"], descriptionKey: "shortcuts.toggleSidebar" },
      { keys: ["Esc"], descriptionKey: "shortcuts.closeFocusDialogs" },
    ],
  },
  {
    titleKey: "shortcuts.groupActions",
    shortcuts: [
      { keys: ["n"], descriptionKey: "shortcuts.newTask" },
      // h is claimed by board-view horizontal navigation on the tasks page,
      // so New Habit doesn't bind there — see
      // .scratch/vim-keyboard-navigation/issues/01-board-view-2d-navigation.md.
      ...(isBoardViewOnTasks
        ? []
        : [
            {
              keys: ["h"],
              descriptionKey: "shortcuts.createHabit",
            } satisfies Shortcut,
          ]),
      { keys: ["e"], descriptionKey: "shortcuts.newEvent" },
      { keys: ["p"], descriptionKey: "shortcuts.newProject" },
      { keys: ["w"], descriptionKey: "shortcuts.newWorkspace" },
      { keys: ["a"], descriptionKey: "shortcuts.archivedProjects" },
      { keys: ["c"], descriptionKey: "shortcuts.toggleCompleted" },
      { keys: [platformKey, "Enter"], descriptionKey: "shortcuts.saveTask" },
      {
        keys: [platformKey, "K"],
        descriptionKey: "shortcuts.searchCommandMenu",
      },
      { keys: ["T"], descriptionKey: "shortcuts.switchTheme" },
      { keys: ["f"], descriptionKey: "shortcuts.focusMode" },
      { keys: ["Shift", "h"], descriptionKey: "shortcuts.showShortcuts" },
    ],
  },
  {
    titleKey: "shortcuts.groupView",
    shortcuts: [
      { keys: ["Shift", "1"], descriptionKey: "shortcuts.listView" },
      { keys: ["Shift", "2"], descriptionKey: "shortcuts.boardView" },
    ],
  },
  {
    titleKey: "shortcuts.groupVim",
    shortcuts: [
      {
        keys: ["j", "↓"],
        descriptionKey: "shortcuts.selectNextTask",
        keyRelation: "alt",
      },
      {
        keys: ["k", "↑"],
        descriptionKey: "shortcuts.selectPreviousTask",
        keyRelation: "alt",
      },
      {
        keys: ["h", "←"],
        descriptionKey: "shortcuts.selectColumnLeft",
        keyRelation: "alt",
      },
      {
        keys: ["l", "→"],
        descriptionKey: "shortcuts.selectColumnRight",
        keyRelation: "alt",
      },
      {
        keys: ["g", "g"],
        descriptionKey: "shortcuts.jumpToFirstTask",
        keyRelation: "sequence",
      },
      { keys: ["G"], descriptionKey: "shortcuts.jumpToLastTask" },
      {
        keys: ["Enter", "o"],
        descriptionKey: "shortcuts.openSelected",
        keyRelation: "alt",
      },
      {
        keys: ["Space", "x"],
        descriptionKey: "shortcuts.toggleCompletion",
        keyRelation: "alt",
      },
      {
        keys: ["d", "Backspace"],
        descriptionKey: "shortcuts.deleteSelected",
        keyRelation: "alt",
      },
      { keys: ["u"], descriptionKey: "shortcuts.undo" },
      {
        keys: ["y", "y"],
        descriptionKey: "shortcuts.yankSelectedTask",
        keyRelation: "sequence",
      },
      { keys: ["p"], descriptionKey: "shortcuts.pasteYankedTask" },
      { keys: ["Esc"], descriptionKey: "shortcuts.clearSelection" },
    ],
  },
];

interface ShortcutsHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isBoardViewOnTasks?: boolean;
}

export function ShortcutsHelp({
  open,
  onOpenChange,
  isBoardViewOnTasks = false,
}: ShortcutsHelpProps) {
  const platformKey = getPlatformKey();
  const shortcuts = getShortcuts(platformKey, isBoardViewOnTasks);
  const { t } = useTranslation();

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[550px] border-border/80 shadow-none p-0">
        <ResponsiveDialogHeader className="p-6 pb-2 border-b border-border/80">
          <ResponsiveDialogTitle className="flex items-center gap-2.5 text-[24px] font-semibold tracking-[-0.02em] text-foreground">
            <Keyboard className="h-5 w-5 text-muted-foreground/70" />
            {t("shortcuts.title")}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="text-[11px] uppercase tracking-[0.02em] text-muted-foreground font-medium pt-1">
            {t("shortcuts.subtitle")}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="max-h-[60vh] overflow-y-auto scrollbar-hide p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
            {shortcuts.map((group) => (
              <div key={group.titleKey} className="space-y-4">
                <h3 className="text-[18px] font-medium tracking-[-0.01em] text-foreground pb-2 border-b border-border/80">
                  {t(group.titleKey)}
                </h3>
                <div className="space-y-3.5">
                  {group.shortcuts.map((shortcut, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-[15px] font-medium tracking-[0.01em]"
                    >
                      <span className="text-foreground/90 font-medium">
                        {t(shortcut.descriptionKey)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {shortcut.keys.map((key, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            {i > 0 && (
                              <span
                                aria-hidden="true"
                                className="text-[11px] font-normal tracking-[0.02em] text-muted-foreground"
                              >
                                {keyConnector[shortcut.keyRelation ?? "chord"]}
                              </span>
                            )}
                            <kbd className="pointer-events-none h-6.5 min-w-[28px] select-none items-center justify-center rounded border border-border bg-sidebar px-2 font-mono text-[13px] font-medium tracking-[0.01em] text-foreground shadow-none flex">
                              {key}
                            </kbd>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
