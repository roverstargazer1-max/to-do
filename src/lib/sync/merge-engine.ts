import type { BackupData } from "@/lib/backup/types";
import type { Task, Project } from "@/lib/types/task";
import type { Habit, HabitEntry } from "@/lib/types/habit";
import type { FocusLog } from "@/lib/types/focus";
import type { CalendarEvent } from "@/lib/types/calendar-event";
import type { Workspace, WorkspaceNode } from "@/lib/types/workspace";

export type MergeEntityType =
  | "task"
  | "project"
  | "habit"
  | "habit_entry"
  | "event"
  | "focus_log"
  | "workspace"
  | "workspace_node";

export type ConflictType = "modify-modify" | "delete-modify" | "modify-delete";

export interface EntityConflict<T = Record<string, unknown>> {
  id: string;
  entityType: MergeEntityType;
  title: string;
  conflictType: ConflictType;
  base: T | null;
  local: T | null;
  remote: T | null;
  differingFields: string[];
}

export interface MergeStats {
  added: number;
  updated: number;
  deleted: number;
  conflicts: number;
  deduped: number;
  orphanedTasksReassigned: number;
}

export interface MergeInput {
  base: BackupData | null;
  local: BackupData;
  remote: BackupData;
}

export interface MergeResult {
  clean: boolean;
  mergedData: BackupData;
  conflicts: EntityConflict[];
  stats: MergeStats;
}

export type ConflictChoice = "local" | "remote" | "duplicate";

const IGNORED_DIFF_FIELDS = new Set([
  "user_id",
  "created_at",
  "updated_at",
  "sync_state",
  "etag",
  "google_etag",
  "remote_calendar_id",
  "source_uuid",
  "deleted_at",
]);

function areValuesEqual(v1: unknown, v2: unknown): boolean {
  if (v1 === v2) return true;
  if ((v1 === null || v1 === undefined) && (v2 === null || v2 === undefined)) {
    return true;
  }
  if (
    typeof v1 === "object" &&
    typeof v2 === "object" &&
    v1 !== null &&
    v2 !== null
  ) {
    return JSON.stringify(v1) === JSON.stringify(v2);
  }
  return false;
}

export function getEntityDifferingFields(
  a: Record<string, unknown> | null | undefined,
  b: Record<string, unknown> | null | undefined,
): string[] {
  if (!a && !b) return [];
  if (!a && b) {
    return Object.keys(b).filter((k) => !IGNORED_DIFF_FIELDS.has(k));
  }
  if (a && !b) {
    return Object.keys(a).filter((k) => !IGNORED_DIFF_FIELDS.has(k));
  }

  const allKeys = new Set([...Object.keys(a!), ...Object.keys(b!)]);
  const differing: string[] = [];

  for (const key of allKeys) {
    if (IGNORED_DIFF_FIELDS.has(key)) continue;
    if (!areValuesEqual(a![key], b![key])) {
      differing.push(key);
    }
  }

  return differing.sort();
}

function getEntityTitle(
  entityType: MergeEntityType,
  item: Record<string, unknown> | null,
): string {
  if (!item) return "";
  switch (entityType) {
    case "task":
      return String(item.content || "Untitled Task");
    case "project":
      return String(item.name || "Untitled Project");
    case "habit":
      return String(item.name || "Untitled Habit");
    case "habit_entry":
      return `${String(item.date || "")} (${item.value ?? 0})`;
    case "event":
      return String(item.title || "Untitled Event");
    case "focus_log":
      return `${String(item.start_time || "")} (${item.duration_seconds ?? item.duration ?? 0}s)`;
    case "workspace":
      return String(item.name || "Untitled Workspace");
    case "workspace_node":
      return String(item.kind || "Workspace Node");
    default:
      return String(item.id || "Item");
  }
}

function parseTimestamp(val: unknown): number {
  if (typeof val === "string" || typeof val === "number") {
    const time = new Date(val).getTime();
    if (!Number.isNaN(time)) return time;
  }
  return 0;
}

interface GenericIdentifiable {
  id: string;
  updated_at?: string;
  created_at?: string;
}

interface MergedCollectionResult<T extends GenericIdentifiable> {
  items: T[];
  conflicts: EntityConflict[];
  added: number;
  updated: number;
  deleted: number;
}

function mergeCollection<T extends GenericIdentifiable>({
  baseList,
  localList,
  remoteList,
  entityType,
}: {
  baseList: T[] | null;
  localList: T[];
  remoteList: T[];
  entityType: MergeEntityType;
}): MergedCollectionResult<T> {
  const baseMap = new Map<string, T>(
    (baseList || []).map((item) => [item.id, item]),
  );
  const localMap = new Map<string, T>(localList.map((item) => [item.id, item]));
  const remoteMap = new Map<string, T>(
    remoteList.map((item) => [item.id, item]),
  );

  const allIds = new Set<string>([
    ...baseMap.keys(),
    ...localMap.keys(),
    ...remoteMap.keys(),
  ]);

  const items: T[] = [];
  const conflicts: EntityConflict[] = [];
  let added = 0;
  let updated = 0;
  let deleted = 0;

  for (const id of allIds) {
    const b = baseMap.get(id);
    const l = localMap.get(id);
    const r = remoteMap.get(id);

    // Case 1: Base is null (fallback mode without base snapshot)
    if (baseList === null) {
      if (l && !r) {
        items.push(l);
        added++;
      } else if (!l && r) {
        items.push(r);
        added++;
      } else if (l && r) {
        const diffs = getEntityDifferingFields(
          l as Record<string, unknown>,
          r as Record<string, unknown>,
        );
        if (diffs.length === 0) {
          const lTime = parseTimestamp(l.updated_at || l.created_at);
          const rTime = parseTimestamp(r.updated_at || r.created_at);
          items.push(lTime >= rTime ? l : r);
        } else {
          // Both sides exist without base. Safe union strategy: take newer by timestamp
          const lTime = parseTimestamp(l.updated_at || l.created_at);
          const rTime = parseTimestamp(r.updated_at || r.created_at);
          items.push(lTime >= rTime ? l : r);
        }
      }
      continue;
    }

    // Case 2: Base exists
    if (b) {
      if (l && r) {
        const localDiffFromBase = getEntityDifferingFields(
          l as Record<string, unknown>,
          b as Record<string, unknown>,
        );
        const remoteDiffFromBase = getEntityDifferingFields(
          r as Record<string, unknown>,
          b as Record<string, unknown>,
        );
        const diffBetweenSides = getEntityDifferingFields(
          l as Record<string, unknown>,
          r as Record<string, unknown>,
        );

        if (diffBetweenSides.length === 0) {
          // Identical content on both sides
          const lTime = parseTimestamp(l.updated_at || l.created_at);
          const rTime = parseTimestamp(r.updated_at || r.created_at);
          items.push(lTime >= rTime ? l : r);
          if (localDiffFromBase.length > 0 || remoteDiffFromBase.length > 0) {
            updated++;
          }
        } else if (
          localDiffFromBase.length > 0 &&
          remoteDiffFromBase.length === 0
        ) {
          // Only local changed
          items.push(l);
          updated++;
        } else if (
          remoteDiffFromBase.length > 0 &&
          localDiffFromBase.length === 0
        ) {
          // Only remote changed
          items.push(r);
          updated++;
        } else {
          // Both changed and differ: Conflict!
          conflicts.push({
            id,
            entityType,
            title: getEntityTitle(
              entityType,
              (l || r || b) as Record<string, unknown>,
            ),
            conflictType: "modify-modify",
            base: b as Record<string, unknown>,
            local: l as Record<string, unknown>,
            remote: r as Record<string, unknown>,
            differingFields: diffBetweenSides,
          });
          // For initial unmerged representation, prefer local
          items.push(l);
        }
      } else if (l && !r) {
        // Remote deleted it
        const localDiffFromBase = getEntityDifferingFields(
          l as Record<string, unknown>,
          b as Record<string, unknown>,
        );
        if (localDiffFromBase.length === 0) {
          // Local didn't modify it -> Remote deletion confirmed
          deleted++;
        } else {
          // Local modified it, remote deleted it -> Conflict!
          conflicts.push({
            id,
            entityType,
            title: getEntityTitle(
              entityType,
              (l || b) as Record<string, unknown>,
            ),
            conflictType: "modify-delete",
            base: b as Record<string, unknown>,
            local: l as Record<string, unknown>,
            remote: null,
            differingFields: localDiffFromBase,
          });
          items.push(l);
        }
      } else if (!l && r) {
        // Local deleted it
        const remoteDiffFromBase = getEntityDifferingFields(
          r as Record<string, unknown>,
          b as Record<string, unknown>,
        );
        if (remoteDiffFromBase.length === 0) {
          // Remote didn't modify it -> Local deletion confirmed
          deleted++;
        } else {
          // Remote modified it, local deleted it -> Conflict!
          conflicts.push({
            id,
            entityType,
            title: getEntityTitle(
              entityType,
              (r || b) as Record<string, unknown>,
            ),
            conflictType: "delete-modify",
            base: b as Record<string, unknown>,
            local: null,
            remote: r as Record<string, unknown>,
            differingFields: remoteDiffFromBase,
          });
          items.push(r);
        }
      } else {
        // Both deleted it
        deleted++;
      }
    } else {
      // Base does not exist (new item)
      if (l && !r) {
        items.push(l);
        added++;
      } else if (!l && r) {
        items.push(r);
        added++;
      } else if (l && r) {
        const diffBetweenSides = getEntityDifferingFields(
          l as Record<string, unknown>,
          r as Record<string, unknown>,
        );
        if (diffBetweenSides.length === 0) {
          const lTime = parseTimestamp(l.updated_at || l.created_at);
          const rTime = parseTimestamp(r.updated_at || r.created_at);
          items.push(lTime >= rTime ? l : r);
          added++;
        } else {
          conflicts.push({
            id,
            entityType,
            title: getEntityTitle(
              entityType,
              (l || r) as Record<string, unknown>,
            ),
            conflictType: "modify-modify",
            base: null,
            local: l as Record<string, unknown>,
            remote: r as Record<string, unknown>,
            differingFields: diffBetweenSides,
          });
          items.push(l);
          added++;
        }
      }
    }
  }

  return { items, conflicts, added, updated, deleted };
}

// ---------------------------------------------------------------------------
// Natural Key Deduplication & Integrity Protection Helpers (Issue 02)
// ---------------------------------------------------------------------------

function deduplicateCalendarEvents(events: CalendarEvent[]): {
  events: CalendarEvent[];
  dedupedCount: number;
} {
  const result: CalendarEvent[] = [];
  const uidIndex = new Map<string, number>(); // ics_uid -> index in result
  const naturalIndex = new Map<string, number>(); // title+start+end -> index in result
  let dedupedCount = 0;

  for (const event of events) {
    let existingIndex: number | undefined;

    if (event.ics_uid && event.ics_uid.trim()) {
      existingIndex = uidIndex.get(event.ics_uid.trim());
    }

    if (
      existingIndex === undefined &&
      event.title &&
      event.start_time &&
      event.end_time
    ) {
      const naturalKey = `${event.title.trim().toLowerCase()}:::${event.start_time}:::${event.end_time}`;
      existingIndex = naturalIndex.get(naturalKey);
    }

    if (existingIndex !== undefined) {
      // Merge into existing
      const existing = result[existingIndex];
      const existingTime = parseTimestamp(
        existing.updated_at || existing.created_at,
      );
      const incomingTime = parseTimestamp(event.updated_at || event.created_at);

      if (incomingTime >= existingTime) {
        // Incoming is newer: keep incoming's fields and ID
        result[existingIndex] = {
          ...existing,
          ...event,
          id: event.id,
          updated_at: event.updated_at || new Date().toISOString(),
        };
      } else {
        // Existing is newer: preserve existing
        result[existingIndex] = {
          ...event,
          ...existing,
          id: existing.id,
          updated_at: existing.updated_at || new Date().toISOString(),
        };
      }
      dedupedCount++;
    } else {
      const newIndex = result.length;
      result.push(event);
      if (event.ics_uid && event.ics_uid.trim()) {
        uidIndex.set(event.ics_uid.trim(), newIndex);
      }
      if (event.title && event.start_time && event.end_time) {
        const naturalKey = `${event.title.trim().toLowerCase()}:::${event.start_time}:::${event.end_time}`;
        naturalIndex.set(naturalKey, newIndex);
      }
    }
  }

  return { events: result, dedupedCount };
}

function deduplicateTasks(tasks: Task[]): {
  tasks: Task[];
  dedupedCount: number;
} {
  const result: Task[] = [];
  const naturalIndex = new Map<string, number>();
  let dedupedCount = 0;

  for (const task of tasks) {
    const projectPart = task.project_id || "";
    const contentPart = (task.content || "").trim().toLowerCase();
    const duePart = task.due_date || "";
    const naturalKey = `${projectPart}:::${contentPart}:::${duePart}`;

    const existingIndex = naturalIndex.get(naturalKey);
    if (existingIndex !== undefined) {
      const existing = result[existingIndex];
      const existingTime = parseTimestamp(
        existing.updated_at || existing.created_at,
      );
      const incomingTime = parseTimestamp(task.updated_at || task.created_at);

      if (incomingTime >= existingTime) {
        result[existingIndex] = {
          ...existing,
          ...task,
          id: task.id,
          updated_at: task.updated_at || new Date().toISOString(),
        };
      } else {
        result[existingIndex] = {
          ...task,
          ...existing,
          id: existing.id,
          updated_at: existing.updated_at || new Date().toISOString(),
        };
      }
      dedupedCount++;
    } else {
      naturalIndex.set(naturalKey, result.length);
      result.push(task);
    }
  }

  return { tasks: result, dedupedCount };
}

function deduplicateHabitEntries(entries: HabitEntry[]): {
  entries: HabitEntry[];
  dedupedCount: number;
} {
  const result: HabitEntry[] = [];
  const naturalIndex = new Map<string, number>();
  let dedupedCount = 0;

  for (const entry of entries) {
    const key = `${entry.habit_id}:::${entry.date}`;
    const existingIndex = naturalIndex.get(key);

    if (existingIndex !== undefined) {
      const existing = result[existingIndex];
      const maxValue = Math.max(
        Number(existing.value || 0),
        Number(entry.value || 0),
      );

      const existingRecord = existing as unknown as Record<string, unknown>;
      const entryRecord = entry as unknown as Record<string, unknown>;
      const mergedCompleted =
        existingRecord.is_completed !== undefined ||
        entryRecord.is_completed !== undefined
          ? Boolean(
              existingRecord.is_completed ||
              entryRecord.is_completed ||
              maxValue > 0,
            )
          : undefined;

      const existingTime = parseTimestamp(existing.created_at);
      const incomingTime = parseTimestamp(entry.created_at);
      const chosenId = incomingTime >= existingTime ? entry.id : existing.id;

      result[existingIndex] = {
        ...existing,
        ...entry,
        id: chosenId,
        value: maxValue,
        ...(mergedCompleted !== undefined
          ? { is_completed: mergedCompleted }
          : {}),
      };
      dedupedCount++;
    } else {
      naturalIndex.set(key, result.length);
      result.push(entry);
    }
  }

  return { entries: result, dedupedCount };
}

function deduplicateFocusLogs(logs: FocusLog[]): {
  logs: FocusLog[];
  dedupedCount: number;
} {
  const result: FocusLog[] = [];
  const naturalIndex = new Map<string, number>();
  let dedupedCount = 0;

  for (const log of logs) {
    const duration =
      log.duration_seconds ??
      (log as unknown as { duration?: number }).duration ??
      0;
    const key = `${log.start_time}:::${duration}`;
    const existingIndex = naturalIndex.get(key);

    if (existingIndex !== undefined) {
      dedupedCount++;
    } else {
      naturalIndex.set(key, result.length);
      result.push(log);
    }
  }

  return { logs: result, dedupedCount };
}

function deduplicateProjects(projects: Project[]): {
  projects: Project[];
  remappedProjectIds: Map<string, string>;
  dedupedCount: number;
} {
  const result: Project[] = [];
  const nameIndex = new Map<string, number>();
  const remappedProjectIds = new Map<string, string>();
  let dedupedCount = 0;

  for (const project of projects) {
    const key = (project.name || "").trim().toLowerCase();
    const existingIndex = nameIndex.get(key);

    if (existingIndex !== undefined) {
      const existing = result[existingIndex];
      const existingTime = parseTimestamp(
        existing.updated_at || existing.created_at,
      );
      const incomingTime = parseTimestamp(
        project.updated_at || project.created_at,
      );

      if (incomingTime >= existingTime) {
        remappedProjectIds.set(existing.id, project.id);
        result[existingIndex] = {
          ...existing,
          ...project,
          id: project.id,
        };
      } else {
        remappedProjectIds.set(project.id, existing.id);
        result[existingIndex] = {
          ...project,
          ...existing,
          id: existing.id,
        };
      }
      dedupedCount++;
    } else {
      nameIndex.set(key, result.length);
      result.push(project);
    }
  }

  return { projects: result, remappedProjectIds, dedupedCount };
}

/**
 * Main 3-Way Merge Pure Function (Issue 01 + Issue 02)
 */
export function mergeBackupData({
  base,
  local,
  remote,
}: MergeInput): MergeResult {
  const stats: MergeStats = {
    added: 0,
    updated: 0,
    deleted: 0,
    conflicts: 0,
    deduped: 0,
    orphanedTasksReassigned: 0,
  };

  const conflicts: EntityConflict[] = [];

  // 1. Merge Projects
  const mergedProjectsRes = mergeCollection<Project>({
    baseList: base?.projects ?? null,
    localList: local.projects || [],
    remoteList: remote.projects || [],
    entityType: "project",
  });
  stats.added += mergedProjectsRes.added;
  stats.updated += mergedProjectsRes.updated;
  stats.deleted += mergedProjectsRes.deleted;
  conflicts.push(...mergedProjectsRes.conflicts);

  const {
    projects: dedupedProjects,
    remappedProjectIds,
    dedupedCount: projectDedupCount,
  } = deduplicateProjects(mergedProjectsRes.items);
  stats.deduped += projectDedupCount;

  // 2. Merge Tasks
  const mergedTasksRes = mergeCollection<Task>({
    baseList: base?.tasks ?? null,
    localList: local.tasks || [],
    remoteList: remote.tasks || [],
    entityType: "task",
  });
  stats.added += mergedTasksRes.added;
  stats.updated += mergedTasksRes.updated;
  stats.deleted += mergedTasksRes.deleted;
  conflicts.push(...mergedTasksRes.conflicts);

  // Apply project remap for merged projects
  const mappedTasks = mergedTasksRes.items.map((t) => {
    if (t.project_id && remappedProjectIds.has(t.project_id)) {
      return { ...t, project_id: remappedProjectIds.get(t.project_id)! };
    }
    return t;
  });

  const { tasks: dedupedTasks, dedupedCount: taskDedupCount } =
    deduplicateTasks(mappedTasks);
  stats.deduped += taskDedupCount;

  // Orphan task check: if project was deleted, move task to Inbox (project_id = null)
  const validProjectIds = new Set(dedupedProjects.map((p) => p.id));
  const finalTasks = dedupedTasks.map((t) => {
    let task = t;
    if (task.project_id && !validProjectIds.has(task.project_id)) {
      stats.orphanedTasksReassigned++;
      task = { ...task, project_id: null };
    }
    return task;
  });

  // Also clean up dangling parent_ids for subtasks
  const validTaskIds = new Set(finalTasks.map((t) => t.id));
  const cleanFinalTasks = finalTasks.map((t) => {
    if (t.parent_id && !validTaskIds.has(t.parent_id)) {
      return { ...t, parent_id: null };
    }
    return t;
  });

  // 3. Merge Habits
  const mergedHabitsRes = mergeCollection<Habit>({
    baseList: base?.habits ?? null,
    localList: local.habits || [],
    remoteList: remote.habits || [],
    entityType: "habit",
  });
  stats.added += mergedHabitsRes.added;
  stats.updated += mergedHabitsRes.updated;
  stats.deleted += mergedHabitsRes.deleted;
  conflicts.push(...mergedHabitsRes.conflicts);

  // 4. Merge Habit Entries
  const mergedEntriesRes = mergeCollection<HabitEntry>({
    baseList: base?.habit_entries ?? null,
    localList: local.habit_entries || [],
    remoteList: remote.habit_entries || [],
    entityType: "habit_entry",
  });
  stats.added += mergedEntriesRes.added;
  stats.updated += mergedEntriesRes.updated;
  stats.deleted += mergedEntriesRes.deleted;
  conflicts.push(...mergedEntriesRes.conflicts);

  const { entries: dedupedEntries, dedupedCount: entryDedupCount } =
    deduplicateHabitEntries(mergedEntriesRes.items);
  stats.deduped += entryDedupCount;

  // 5. Merge Calendar Events
  const mergedEventsRes = mergeCollection<CalendarEvent>({
    baseList: base?.events ?? null,
    localList: local.events || [],
    remoteList: remote.events || [],
    entityType: "event",
  });
  stats.added += mergedEventsRes.added;
  stats.updated += mergedEventsRes.updated;
  stats.deleted += mergedEventsRes.deleted;
  conflicts.push(...mergedEventsRes.conflicts);

  const { events: dedupedEvents, dedupedCount: eventDedupCount } =
    deduplicateCalendarEvents(mergedEventsRes.items);
  stats.deduped += eventDedupCount;

  // 6. Merge Focus Logs
  const mergedFocusRes = mergeCollection<FocusLog>({
    baseList: base?.focus_logs ?? null,
    localList: local.focus_logs || [],
    remoteList: remote.focus_logs || [],
    entityType: "focus_log",
  });
  stats.added += mergedFocusRes.added;
  stats.updated += mergedFocusRes.updated;
  stats.deleted += mergedFocusRes.deleted;
  conflicts.push(...mergedFocusRes.conflicts);

  const { logs: dedupedLogs, dedupedCount: logDedupCount } =
    deduplicateFocusLogs(mergedFocusRes.items);
  stats.deduped += logDedupCount;

  // 7. Merge Workspaces & Nodes if present
  let mergedWorkspaces: Workspace[] | undefined;
  if (base?.workspaces || local.workspaces || remote.workspaces) {
    const wsRes = mergeCollection<Workspace>({
      baseList: base?.workspaces ?? null,
      localList: local.workspaces || [],
      remoteList: remote.workspaces || [],
      entityType: "workspace",
    });
    stats.added += wsRes.added;
    stats.updated += wsRes.updated;
    stats.deleted += wsRes.deleted;
    conflicts.push(...wsRes.conflicts);
    mergedWorkspaces = wsRes.items;
  }

  let mergedWorkspaceNodes: WorkspaceNode[] | undefined;
  if (
    base?.workspace_nodes ||
    local.workspace_nodes ||
    remote.workspace_nodes
  ) {
    const nodeRes = mergeCollection<WorkspaceNode>({
      baseList: base?.workspace_nodes ?? null,
      localList: local.workspace_nodes || [],
      remoteList: remote.workspace_nodes || [],
      entityType: "workspace_node",
    });
    stats.added += nodeRes.added;
    stats.updated += nodeRes.updated;
    stats.deleted += nodeRes.deleted;
    conflicts.push(...nodeRes.conflicts);
    mergedWorkspaceNodes = nodeRes.items;
  }

  // 8. Location history union
  const mergedLocations = Array.from(
    new Set([
      ...(base?.location_history || []),
      ...(local.location_history || []),
      ...(remote.location_history || []),
    ]),
  );

  stats.conflicts = conflicts.length;
  const clean = conflicts.length === 0;

  const mergedData: BackupData = {
    metadata: {
      version: Math.max(
        base?.metadata?.version || 1,
        local.metadata?.version || 1,
        remote.metadata?.version || 1,
      ),
      appVersion:
        local.metadata?.appVersion ||
        remote.metadata?.appVersion ||
        base?.metadata?.appVersion ||
        "1.0.0",
      exportedAt: new Date().toISOString(),
    },
    tasks: cleanFinalTasks,
    projects: dedupedProjects,
    habits: mergedHabitsRes.items,
    habit_entries: dedupedEntries,
    focus_logs: dedupedLogs,
    events: dedupedEvents,
    location_history: mergedLocations.length > 0 ? mergedLocations : undefined,
    ...(mergedWorkspaces ? { workspaces: mergedWorkspaces } : {}),
    ...(mergedWorkspaceNodes ? { workspace_nodes: mergedWorkspaceNodes } : {}),
    // Retain any optional visual sections from local/remote
    visual_assets: local.visual_assets || remote.visual_assets,
    visual_asset_versions:
      local.visual_asset_versions || remote.visual_asset_versions,
    visual_annotations: local.visual_annotations || remote.visual_annotations,
    visual_derived: local.visual_derived || remote.visual_derived,
    visual_relations: local.visual_relations || remote.visual_relations,
    visual_flow_drafts: local.visual_flow_drafts || remote.visual_flow_drafts,
    visual_asset_manifest:
      local.visual_asset_manifest || remote.visual_asset_manifest,
    visual_asset_files: {
      ...(remote.visual_asset_files || {}),
      ...(local.visual_asset_files || {}),
    },
  };

  return {
    clean,
    mergedData,
    conflicts,
    stats,
  };
}

/**
 * Applies user choices to resolve pending conflicts into a finalized BackupData.
 */
export function resolveConflicts({
  mergeResult,
  resolutions,
}: {
  mergeResult: MergeResult;
  resolutions: Record<string, ConflictChoice>;
}): BackupData {
  const data = JSON.parse(JSON.stringify(mergeResult.mergedData)) as BackupData;

  const generateNewId = () => {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
    return `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  };

  for (const conflict of mergeResult.conflicts) {
    const choice = resolutions[conflict.id] || "local";
    const entityType = conflict.entityType;

    const replaceOrInsert = <T extends GenericIdentifiable>(
      list: T[],
      item: T | null,
    ): T[] => {
      const idx = list.findIndex((i) => i.id === conflict.id);
      if (item === null) {
        // Deleted
        if (idx !== -1) list.splice(idx, 1);
      } else if (idx !== -1) {
        list[idx] = item;
      } else {
        list.push(item);
      }
      return list;
    };

    const duplicateItem = <T extends GenericIdentifiable>(
      list: T[],
      localItem: T | null,
      remoteItem: T | null,
    ): T[] => {
      if (!localItem && !remoteItem) return list;
      if (!localItem && remoteItem) return replaceOrInsert(list, remoteItem);
      if (localItem && !remoteItem) return replaceOrInsert(list, localItem);

      // Both exist: keep remote under current id, add local with new id
      const idx = list.findIndex((i) => i.id === conflict.id);
      if (idx !== -1) {
        list[idx] = remoteItem!;
      } else {
        list.push(remoteItem!);
      }

      const localCopy: T = {
        ...localItem!,
        id: generateNewId(),
      };
      if ("content" in localCopy && typeof localCopy.content === "string") {
        localCopy.content = `${localCopy.content} (副本)`;
      } else if ("title" in localCopy && typeof localCopy.title === "string") {
        localCopy.title = `${localCopy.title} (副本)`;
      } else if ("name" in localCopy && typeof localCopy.name === "string") {
        localCopy.name = `${localCopy.name} (副本)`;
      }
      list.push(localCopy);
      return list;
    };

    switch (entityType) {
      case "task": {
        if (choice === "local") {
          data.tasks = replaceOrInsert(
            data.tasks,
            conflict.local as unknown as Task,
          );
        } else if (choice === "remote") {
          data.tasks = replaceOrInsert(
            data.tasks,
            conflict.remote as unknown as Task,
          );
        } else if (choice === "duplicate") {
          data.tasks = duplicateItem(
            data.tasks,
            conflict.local as unknown as Task,
            conflict.remote as unknown as Task,
          );
        }
        break;
      }
      case "project": {
        if (choice === "local") {
          data.projects = replaceOrInsert(
            data.projects,
            conflict.local as unknown as Project,
          );
        } else if (choice === "remote") {
          data.projects = replaceOrInsert(
            data.projects,
            conflict.remote as unknown as Project,
          );
        } else if (choice === "duplicate") {
          data.projects = duplicateItem(
            data.projects,
            conflict.local as unknown as Project,
            conflict.remote as unknown as Project,
          );
        }
        break;
      }
      case "habit": {
        if (choice === "local") {
          data.habits = replaceOrInsert(
            data.habits,
            conflict.local as unknown as Habit,
          );
        } else if (choice === "remote") {
          data.habits = replaceOrInsert(
            data.habits,
            conflict.remote as unknown as Habit,
          );
        } else if (choice === "duplicate") {
          data.habits = duplicateItem(
            data.habits,
            conflict.local as unknown as Habit,
            conflict.remote as unknown as Habit,
          );
        }
        break;
      }
      case "habit_entry": {
        if (choice === "local") {
          data.habit_entries = replaceOrInsert(
            data.habit_entries,
            conflict.local as unknown as HabitEntry,
          );
        } else if (choice === "remote") {
          data.habit_entries = replaceOrInsert(
            data.habit_entries,
            conflict.remote as unknown as HabitEntry,
          );
        }
        break;
      }
      case "event": {
        if (choice === "local") {
          data.events = replaceOrInsert(
            data.events,
            conflict.local as unknown as CalendarEvent,
          );
        } else if (choice === "remote") {
          data.events = replaceOrInsert(
            data.events,
            conflict.remote as unknown as CalendarEvent,
          );
        } else if (choice === "duplicate") {
          data.events = duplicateItem(
            data.events,
            conflict.local as unknown as CalendarEvent,
            conflict.remote as unknown as CalendarEvent,
          );
        }
        break;
      }
      case "focus_log": {
        if (choice === "local") {
          data.focus_logs = replaceOrInsert(
            data.focus_logs,
            conflict.local as unknown as FocusLog,
          );
        } else if (choice === "remote") {
          data.focus_logs = replaceOrInsert(
            data.focus_logs,
            conflict.remote as unknown as FocusLog,
          );
        }
        break;
      }
      case "workspace": {
        if (data.workspaces) {
          if (choice === "local") {
            data.workspaces = replaceOrInsert(
              data.workspaces,
              conflict.local as unknown as Workspace,
            );
          } else if (choice === "remote") {
            data.workspaces = replaceOrInsert(
              data.workspaces,
              conflict.remote as unknown as Workspace,
            );
          } else if (choice === "duplicate") {
            data.workspaces = duplicateItem(
              data.workspaces,
              conflict.local as unknown as Workspace,
              conflict.remote as unknown as Workspace,
            );
          }
        }
        break;
      }
      case "workspace_node": {
        if (data.workspace_nodes) {
          if (choice === "local") {
            data.workspace_nodes = replaceOrInsert(
              data.workspace_nodes,
              conflict.local as unknown as WorkspaceNode,
            );
          } else if (choice === "remote") {
            data.workspace_nodes = replaceOrInsert(
              data.workspace_nodes,
              conflict.remote as unknown as WorkspaceNode,
            );
          }
        }
        break;
      }
    }
  }

  // Re-run orphan protection on finalized resolved data
  const validProjectIds = new Set(data.projects.map((p) => p.id));
  data.tasks = data.tasks.map((task) => {
    if (task.project_id && !validProjectIds.has(task.project_id)) {
      return { ...task, project_id: null };
    }
    return task;
  });

  return data;
}
