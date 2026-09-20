"use client";

import * as React from "react";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { parseISO } from "date-fns";
import {
  CalendarIcon,
  HomeIcon,
  CheckCircle2,
  Columns,
  FolderPlus,
  Keyboard,
  Monitor,
  Copy,
  Check,
  ListFilter,
  Layers,
  Clock,
  Command as CommandIcon,
  ArchiveRestore,
  RefreshCw,
  CalendarPlus,
  LayoutGridIcon,
  MoonIcon,
  PlusIcon,
  SettingsIcon,
  SunIcon,
  SearchX,
} from "lucide-react";
import { WorkspaceIcon } from "@/components/icons/WorkspaceIcon";
import { EmptyState } from "@/components/ui/EmptyState";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useTaskActions } from "@/components/TaskActionsProvider";
import { useProjectActions } from "@/components/ProjectActionsProvider";
import { useWorkspaceActions } from "@/components/workspace/WorkspaceActionsProvider";
import { useHabitActions } from "@/components/habits/HabitActionsProvider";
import { useCompletedTasks } from "@/components/CompletedTasksProvider";
import { useAuth } from "@/components/AuthProvider";
import { useSidebar } from "@/components/ui/sidebar";
import { useDocumentPiP } from "@/lib/hooks/useDocumentPiP";
import { useUiStore } from "@/lib/store/uiStore";
import { useBackNavigation } from "@/lib/hooks/useBackNavigation";
import { useCalendarStore } from "@/lib/calendar/store";
import { useTasks } from "@/lib/hooks/useTasks";
import { useHabits } from "@/lib/hooks/useHabits";
import { useCalendarEventsList } from "@/lib/hooks/useCalendarEventsList";
import { getHabitIcon } from "@/components/habits/shared/HabitIconPicker";
import type { Habit } from "@/lib/types/habit";
import { useQueryClient } from "@tanstack/react-query";
import { notify } from "@/lib/notify";
import { getPlatformKey } from "@/lib/utils/platform";
import { useTranslation } from "@/lib/i18n/useTranslation";

interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CommandSearchResultsProps {
  search: string;
  runCommand: (command: () => void) => void;
  setSelectedTaskId: (id: string | null) => void;
  openEditHabit: (habit: Habit) => void;
  setDate: (date: Date) => void;
}

/**
 * Content-search groups (Tasks, Habits, Events) for the command menu.
 * Rendered only while the dialog is open so the data hooks fetch on open,
 * not on every cold page load; returns null until the user types.
 */
function CommandSearchResults({
  search,
  runCommand,
  setSelectedTaskId,
  openEditHabit,
  setDate,
}: CommandSearchResultsProps) {
  const router = useRouter();
  const { data: tasks = [] } = useTasks();
  const { data: habits = [] } = useHabits();
  const events = useCalendarEventsList();
  const { t } = useTranslation();

  // Mapped independently of `search` — cmdk filters these items client-side,
  // so re-deriving them on every keystroke would be wasted work.
  const taskItems = useMemo(
    () =>
      tasks.map((task) => (
        <CommandItem
          key={task.id}
          // cmdk keys filtering/selection by `value`; ids keep duplicate
          // contents (e.g. two "Buy groceries") individually navigable.
          value={`task-${task.id}`}
          keywords={[task.content]}
          onSelect={() =>
            runCommand(() => {
              setSelectedTaskId(task.id);
              router.push("/");
            })
          }
        >
          <CheckCircle2 className="mr-2 h-5 w-5" />
          <span>{task.content}</span>
        </CommandItem>
      )),
    [tasks, runCommand, setSelectedTaskId, router],
  );

  const habitItems = useMemo(
    () =>
      habits.map((habit) => {
        const Icon = getHabitIcon(habit.icon);
        return (
          <CommandItem
            key={habit.id}
            value={`habit-${habit.id}`}
            keywords={[habit.name]}
            onSelect={() => runCommand(() => openEditHabit(habit))}
          >
            <Icon className="mr-2 h-5 w-5" />
            <span>{habit.name}</span>
          </CommandItem>
        );
      }),
    [habits, runCommand, openEditHabit],
  );

  const eventItems = useMemo(
    () =>
      events.map((event) => (
        <CommandItem
          key={event.id}
          value={`event-${event.id}`}
          keywords={[event.title]}
          onSelect={() =>
            runCommand(() => {
              // Parse the date-only portion in local time so an all-day event
              // stored as ...T00:00:00Z doesn't land on the prior day in
              // negative-UTC offsets.
              setDate(parseISO(event.date.slice(0, 10)));
              router.push("/calendar");
            })
          }
        >
          <CalendarIcon className="mr-2 h-5 w-5" />
          <span>{event.title}</span>
        </CommandItem>
      )),
    [events, runCommand, setDate, router],
  );

  if (search.length === 0) return null;

  return (
    <>
      <CommandGroup heading={t("command.groupTasks")}>{taskItems}</CommandGroup>
      <CommandGroup heading={t("command.groupHabits")}>
        {habitItems}
      </CommandGroup>
      <CommandGroup heading={t("command.groupEvents")}>
        {eventItems}
      </CommandGroup>
    </>
  );
}

export function CommandMenu({ open, onOpenChange }: CommandMenuProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setTheme, resolvedTheme } = useTheme();
  const { openAddTask } = useTaskActions();
  const { openCreateProject } = useProjectActions();
  const { openCreateWorkspace } = useWorkspaceActions();
  const { openAddHabit, openEditHabit } = useHabitActions();
  const { openCreateEvent, setDate } = useCalendarStore();
  const { openSheet: openCompletedSheet } = useCompletedTasks();
  const { user, isGuestMode } = useAuth();
  const { toggleSidebar } = useSidebar();
  const { openPiP, closePiP, isPiPActive } = useDocumentPiP();
  const setShortcutsHelpOpen = useUiStore(
    (state) => state.setShortcutsHelpOpen,
  );
  const setSortBy = useUiStore((state) => state.setSortBy);
  const setGroupBy = useUiStore((state) => state.setGroupBy);
  const setArchivedProjectsOpen = useUiStore(
    (state) => state.setArchivedProjectsOpen,
  );
  const setSelectedTaskId = useUiStore((state) => state.setSelectedTaskId);
  const [copied, setCopied] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const { t } = useTranslation();

  // Handle back navigation to close command menu instead of navigating away
  useBackNavigation(open, () => onOpenChange(false));

  const runCommand = React.useCallback(
    (command: () => void) => {
      onOpenChange(false);
      command();
    },
    [onOpenChange],
  );

  return (
    <>
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <div className="p-6 pb-3 border-b border-border/80 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <CommandIcon className="h-5 w-5 text-muted-foreground/70" />
            <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-foreground">
              {t("command.title")}
            </h2>
          </div>
          <p className="text-[11px] uppercase tracking-[0.02em] text-muted-foreground font-medium pt-1">
            {t("command.subtitle")}
          </p>
        </div>
        <CommandInput
          placeholder={t("command.searchPlaceholder")}
          value={search}
          onValueChange={setSearch}
        />
        <CommandList>
          <CommandEmpty>
            <EmptyState
              icon={SearchX}
              title={t("command.emptyTitle")}
              description={t("command.emptyDescription")}
              className="py-8 gap-3"
            />
          </CommandEmpty>

          <CommandGroup heading={t("command.groupActions")}>
            <CommandItem onSelect={() => runCommand(() => openAddTask())}>
              <PlusIcon className="mr-2 h-5 w-5" />
              <span>{t("command.newTask")}</span>
              <CommandShortcut>N</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => openAddHabit())}>
              <PlusIcon className="mr-2 h-5 w-5" />
              <span>{t("command.newHabit")}</span>
              <CommandShortcut>H</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => openCreateEvent())}>
              <CalendarPlus className="mr-2 h-5 w-5" />
              <span>{t("command.newEvent")}</span>
              <CommandShortcut>E</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => openCreateProject())}>
              <FolderPlus className="mr-2 h-5 w-5" />
              <span>{t("command.newProject")}</span>
              <CommandShortcut>P</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => openCreateWorkspace())}
            >
              <WorkspaceIcon className="mr-2 h-5 w-5" />
              <span>{t("command.newWorkspace")}</span>
              <CommandShortcut>W</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => setArchivedProjectsOpen(true))}
            >
              <ArchiveRestore className="mr-2 h-5 w-5" />
              <span>{t("command.archivedProjects")}</span>
              <CommandShortcut>A</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => openCompletedSheet())}
            >
              <CheckCircle2 className="mr-2 h-5 w-5" />
              <span>{t("command.showCompleted")}</span>
              <CommandShortcut>C</CommandShortcut>
            </CommandItem>
            {user && !isGuestMode && (
              <CommandItem
                onSelect={() =>
                  runCommand(() => {
                    queryClient.invalidateQueries();
                    notify.success(t("command.syncing"));
                  })
                }
              >
                <RefreshCw className="mr-2 h-5 w-5" />
                <span>{t("command.syncNow")}</span>
              </CommandItem>
            )}
            <CommandItem
              onSelect={() =>
                runCommand(() => {
                  if (isPiPActive) closePiP();
                  else openPiP();
                })
              }
            >
              <Monitor className="mr-2 h-5 w-5" />
              <span>
                {isPiPActive ? t("command.closePip") : t("command.openPip")}
              </span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => toggleSidebar())}>
              <Columns className="mr-2 h-5 w-5" />
              <span>{t("command.toggleSidebar")}</span>
              <CommandShortcut>{getPlatformKey()}+B</CommandShortcut>
            </CommandItem>
          </CommandGroup>

          {open && (
            <CommandSearchResults
              search={search}
              runCommand={runCommand}
              setSelectedTaskId={setSelectedTaskId}
              openEditHabit={openEditHabit}
              setDate={setDate}
            />
          )}

          <CommandSeparator />

          <CommandGroup heading={t("command.groupFocus")}>
            <CommandItem
              onSelect={() =>
                runCommand(() => router.push("/focus?duration=25"))
              }
            >
              <Clock className="mr-2 h-5 w-5" />
              <span>{t("command.pomodoro")}</span>
              <CommandShortcut>F</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                runCommand(() => router.push("/focus?duration=50"))
              }
            >
              <Clock className="mr-2 h-5 w-5" />
              <span>{t("command.deepWork")}</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => router.push("/focus"))}
            >
              <Clock className="mr-2 h-5 w-5" />
              <span>{t("command.focusSession")}</span>
              <CommandShortcut>5</CommandShortcut>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading={t("command.groupView")}>
            <CommandItem
              onSelect={() =>
                runCommand(() => {
                  setSortBy("date");
                  router.push("/");
                })
              }
            >
              <ListFilter className="mr-2 h-5 w-5" />
              <span>{t("command.sortByDate")}</span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                runCommand(() => {
                  setSortBy("priority");
                  router.push("/");
                })
              }
            >
              <ListFilter className="mr-2 h-5 w-5" />
              <span>{t("command.sortByPriority")}</span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                runCommand(() => {
                  setGroupBy("project");
                  router.push("/");
                })
              }
            >
              <Layers className="mr-2 h-5 w-5" />
              <span>{t("command.groupByProject")}</span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                runCommand(() => {
                  setGroupBy("none");
                  router.push("/");
                })
              }
            >
              <Layers className="mr-2 h-5 w-5" />
              <span>{t("command.ungroupTasks")}</span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                runCommand(() =>
                  setTheme(resolvedTheme === "light" ? "dark" : "light"),
                )
              }
            >
              {resolvedTheme === "light" ? (
                <MoonIcon className="mr-2 h-5 w-5" />
              ) : (
                <SunIcon className="mr-2 h-5 w-5" />
              )}
              <span>{t("command.toggleDarkMode")}</span>
              <CommandShortcut>T</CommandShortcut>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading={t("command.groupNavigation")}>
            <CommandItem onSelect={() => runCommand(() => router.push("/"))}>
              <HomeIcon className="mr-2 h-5 w-5" />
              <span>{t("common.nav.home")}</span>
              <CommandShortcut>1</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => router.push("/habits"))}
            >
              <Layers className="mr-2 h-5 w-5" />
              <span>{t("common.nav.habits")}</span>
              <CommandShortcut>2</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => router.push("/calendar"))}
            >
              <CalendarIcon className="mr-2 h-5 w-5" />
              <span>{t("common.nav.calendar")}</span>
              <CommandShortcut>3</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => router.push("/stats"))}
            >
              <LayoutGridIcon className="mr-2 h-5 w-5" />
              <span>{t("common.nav.statistics")}</span>
              <CommandShortcut>4</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => router.push("/workspaces"))}
            >
              <WorkspaceIcon className="mr-2 h-5 w-5" />
              <span>{t("common.nav.workspaces")}</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading={t("command.groupAccount")}>
            <CommandItem
              onSelect={() => runCommand(() => router.push("/settings"))}
            >
              <SettingsIcon className="mr-2 h-5 w-5" />
              <span>{t("common.nav.settings")}</span>
              <CommandShortcut>6</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => setShortcutsHelpOpen(true))}
            >
              <Keyboard className="mr-2 h-5 w-5" />
              <span>{t("command.keyboardShortcuts")}</span>
              <CommandShortcut>Shift+H</CommandShortcut>
            </CommandItem>
            {user && (
              <CommandItem
                onSelect={() =>
                  runCommand(() => {
                    navigator.clipboard.writeText(user.id);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  })
                }
              >
                {copied ? (
                  <Check className="mr-2 h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="mr-2 h-5 w-5" />
                )}
                <span>{t("command.copyUserId")}</span>
              </CommandItem>
            )}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
