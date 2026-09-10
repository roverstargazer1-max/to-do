import type { TranslationKey } from "@/lib/i18n/dictionaries/en";

export type SortOption = "date" | "priority" | "alphabetical" | "custom";
export type GroupOption = "none" | "priority" | "date" | "project";
export type TaskViewMode = "list" | "board";

// Dictionary keys, not display strings — renderers resolve them via `t()`.
export const SORT_LABELS: Record<SortOption, TranslationKey> = {
  date: "tasks.sort.date",
  priority: "tasks.sort.priority",
  alphabetical: "tasks.sort.alphabetical",
  custom: "tasks.sort.custom",
};

export const GROUP_LABELS: Record<GroupOption, TranslationKey> = {
  none: "tasks.group.none",
  priority: "tasks.group.priority",
  date: "tasks.group.date",
  project: "tasks.group.project",
};
