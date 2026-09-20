/**
 * Client-safe seam in front of the local (SQLite) data layer.
 *
 * Browser bundles must never reach `@/lib/db/**` or `@/lib/assets/**` — those
 * pull in `node:fs`/`better-sqlite3` and break the client build. Node and test
 * contexts register a concrete implementation at runtime (see
 * `local-dal-node.ts`) and client-bundled modules consult this registry.
 *
 * Rule for this file: `import type` is fine (it is erased before bundling), but
 * a value import of `@/lib/db/**` or `@/lib/assets/**` is forbidden.
 */

import type {
  CalendarEvent,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
} from "@/lib/types/calendar-event";
import type { FocusLog } from "@/lib/types/focus";
import type { Habit, HabitEntry, HabitWithEntries } from "@/lib/types/habit";
import type {
  CreateTaskInput,
  ListTasksOptions,
  Project,
  Task,
  UpdateTaskInput,
} from "@/lib/types/task";
import type {
  VisualAnnotation,
  VisualAsset,
  VisualAssetVersion,
  VisualDerivedInfo,
  VisualFlowDraft,
  VisualRelation,
} from "@/lib/types/visual";
import type {
  Workspace,
  WorkspaceEdge,
  WorkspaceNode,
} from "@/lib/types/workspace";
import type {
  VisualAssetRecordInput,
  VisualVersionRecordInput,
} from "@/lib/visual/store";

export type LocalTaskCreateInput = CreateTaskInput & {
  id?: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
};

export type LocalProjectCreateInput = {
  id?: string;
  user_id?: string;
  name: string;
  color?: string;
  view_style?: "list" | "board";
  is_inbox?: boolean;
  is_archived?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type LocalProjectUpdateInput = Partial<{
  name: string;
  color: string;
  view_style: "list" | "board";
  is_inbox: boolean;
  is_archived: boolean;
}>;

export type LocalHabitCreateInput = {
  id?: string;
  user_id?: string;
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  start_date?: string | null;
  habitType?: "boolean" | "measurable" | null;
  frequencyCount?: number | null;
  frequencyPeriod?: "day" | "week" | "month" | null;
  targetType?: "at_least" | "at_most" | null;
  targetValue?: number | null;
  unit?: string | null;
  source_uuid?: string | null;
  sort_order?: number;
};

export type LocalFocusLogInput = {
  id?: string;
  user_id?: string;
  task_id?: string | null;
  start_time: string;
  end_time?: string | null;
  duration_seconds: number;
  session_type?: string;
  notes?: string | null;
};

export type LocalStreak = { currentStreak: number; longestStreak: number };

export type LocalWorkspaceCreateInput = {
  id?: string;
  user_id?: string;
  name: string;
  color?: string | null;
};

export type LocalWorkspaceNodeInput = {
  id?: string;
  workspace_id: string;
  user_id?: string;
  kind: string;
  entity_type?: string | null;
  entity_id?: string | null;
  position_x: number;
  position_y: number;
  width?: number | null;
  height?: number | null;
  group_id?: string | null;
  display_config?: Record<string, unknown> | null;
};

export type LocalWorkspaceEdgeInput = {
  id?: string;
  workspace_id: string;
  user_id?: string;
  source_node_id: string;
  target_node_id: string;
};

export type LocalNodeUpdateInput = Partial<{
  position_x: number;
  position_y: number;
  width: number | null;
  height: number | null;
  group_id: string | null;
  display_config: Record<string, unknown> | null;
}>;

export type LocalNodeBatchUpdate = {
  id: string;
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
};

export interface LocalTasksDal {
  list(options?: ListTasksOptions): Task[];
  getById(id: string): Task | null;
  create(input: LocalTaskCreateInput): Task;
  update(
    id: string,
    updates: Partial<UpdateTaskInput & Partial<Task>>,
  ): Task | null;
  toggleComplete(id: string): Task | null;
  delete(id: string): boolean;
  reorder(taskIds: string[]): void;
}

export interface LocalProjectsDal {
  list(userId?: string): Project[];
  getById(id: string): Project | null;
  create(input: LocalProjectCreateInput): Project;
  update(id: string, updates: LocalProjectUpdateInput): Project | null;
  delete(id: string): boolean;
}

export interface LocalHabitsDal {
  list(userId?: string): HabitWithEntries[];
  getById(id: string): HabitWithEntries | null;
  create(input: LocalHabitCreateInput): Habit;
  update(id: string, updates: Partial<Habit>): Habit | null;
  delete(id: string): boolean;
  recordEntry(habitId: string, date: string, value?: number): HabitEntry;
  upsertEntry(habitId: string, date: string, value?: number): HabitEntry;
  deleteEntry(habitId: string, date: string): boolean;
  calculateStreak(habitId: string): LocalStreak;
}

export interface LocalFocusDal {
  list(userId?: string, limit?: number): FocusLog[];
  getTotalFocusSeconds(userId?: string): number;
  create(input: LocalFocusLogInput): FocusLog;
  logSession(input: LocalFocusLogInput): FocusLog;
}

export interface LocalCalendarDal {
  list(options?: {
    start?: string;
    end?: string;
    userId?: string;
  }): CalendarEvent[];
  getById(id: string): CalendarEvent | null;
  create(
    input: CreateCalendarEventInput & { id?: string; user_id?: string },
  ): CalendarEvent;
  update(
    id: string,
    updates: Partial<UpdateCalendarEventInput & Partial<CalendarEvent>>,
  ): CalendarEvent | null;
  delete(id: string): boolean;
}

export interface LocalWorkspacesDal {
  list(userId?: string): Workspace[];
  get(id: string): {
    workspace: Workspace;
    nodes: WorkspaceNode[];
    edges: WorkspaceEdge[];
  } | null;
  create(input: LocalWorkspaceCreateInput): Workspace;
  updateWorkspace(
    id: string,
    updates: Partial<{ name: string; color: string | null }>,
  ): Workspace | null;
  deleteWorkspace(id: string): boolean;
  createNode(input: LocalWorkspaceNodeInput): WorkspaceNode;
  updateNode(id: string, updates: LocalNodeUpdateInput): WorkspaceNode | null;
  batchUpdateNodes(nodes: LocalNodeBatchUpdate[]): void;
  deleteNode(id: string): boolean;
  createEdge(input: LocalWorkspaceEdgeInput): WorkspaceEdge;
  deleteEdge(id: string): boolean;
}

export interface LocalVisualDal {
  listAssets(workspaceId?: string, includeDeleted?: boolean): VisualAsset[];
  getAsset(assetId: string, includeDeleted?: boolean): VisualAsset | null;
  getVersion(assetId: string, versionId?: string): VisualAssetVersion | null;
  readVersionBytes(assetId: string, versionId?: string): Uint8Array;
  listVersions(assetId: string): VisualAssetVersion[];
  createAsset(input: VisualAssetRecordInput): VisualAsset;
  appendVersion(input: VisualVersionRecordInput): VisualAsset;
  updateAsset(asset: VisualAsset): VisualAsset;
  removeAsset(assetId: string): void;
  listAnnotations(assetId: string, versionId?: string): VisualAnnotation[];
  putAnnotation(annotation: VisualAnnotation): VisualAnnotation;
  removeAnnotation(annotationId: string): void;
  listDerived(assetId: string, versionId?: string): VisualDerivedInfo[];
  putDerived(derived: VisualDerivedInfo): VisualDerivedInfo;
  listRelations(workspaceId: string): VisualRelation[];
  listAllRelations(): VisualRelation[];
  putRelation(relation: VisualRelation): VisualRelation;
  removeRelation(relationId: string): void;
  listDrafts(workspaceId: string): VisualFlowDraft[];
  listAllDrafts(): VisualFlowDraft[];
  getDraft(draftId: string): VisualFlowDraft | null;
  putDraft(draft: VisualFlowDraft): VisualFlowDraft;
  clearAll(): void;
}

export interface LocalMaintenanceDal {
  /** Wipes every domain table (the SQL batch `mockStore.clearData()` ran). */
  clearDomainData(): void;
}

export interface LocalDal {
  tasks: LocalTasksDal;
  projects: LocalProjectsDal;
  habits: LocalHabitsDal;
  focus: LocalFocusDal;
  calendar: LocalCalendarDal;
  workspaces: LocalWorkspacesDal;
  visual: LocalVisualDal;
  maintenance: LocalMaintenanceDal;
}

let localDal: LocalDal | null = null;

export function registerLocalDal(next: LocalDal | null): void {
  localDal = next;
}

export function getLocalDal(): LocalDal | null {
  return localDal;
}

export function isLocalDalMode(): boolean {
  return localDal !== null;
}
