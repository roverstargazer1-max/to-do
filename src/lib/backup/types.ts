import type { Task, Project } from "@/lib/types/task";
import type { Habit, HabitEntry } from "@/lib/types/habit";
import type { FocusLog } from "@/lib/types/focus";
import type { CalendarEvent } from "@/lib/types/calendar-event";
import type { Workspace, WorkspaceNode } from "@/lib/types/workspace";
import type {
  VisualAnnotation,
  VisualAsset,
  VisualAssetVersion,
  VisualDerivedInfo,
  VisualFlowDraft,
  VisualRelation,
} from "@/lib/types/visual";

/**
 * Metadata for the backup archive to handle versioning and audits.
 */
export interface BackupMetadata {
  version: number; // Backup format version (start at 1)
  appVersion: string; // From package.json
  exportedAt: string; // ISO timestamp
}

export interface VisualAssetBackupManifestEntry {
  versionId: string;
  assetId: string;
  path: string;
  byteSize: number;
  sha256: string;
  mimeType: string;
}

/**
 * Root data structure for Guest Mode backups.
 * Contains all essential user data for full restoration.
 */
export interface BackupData {
  metadata: BackupMetadata;
  tasks: Task[];
  projects: Project[];
  habits: Habit[];
  habit_entries: HabitEntry[];
  focus_logs: FocusLog[];
  events: CalendarEvent[];
  location_history?: string[];
  /**
   * Guest workspace sections (ticket 09, ADR 0018): row ids preserved verbatim
   * per Backup convention. Optional so pre-workspace zips (and the cloud
   * account export, which doesn't carry canvas layout) still parse.
   */
  workspaces?: Workspace[];
  workspace_nodes?: WorkspaceNode[];
  /** Visual metadata is JSON; bytes are stored as ZIP entries below. */
  visual_assets?: VisualAsset[];
  visual_asset_versions?: Array<Omit<VisualAssetVersion, "data">>;
  visual_annotations?: VisualAnnotation[];
  visual_derived?: VisualDerivedInfo[];
  visual_relations?: VisualRelation[];
  visual_flow_drafts?: VisualFlowDraft[];
  visual_asset_manifest?: VisualAssetBackupManifestEntry[];
  /** Populated in memory by parseBackupZip; omitted from backup.json. */
  visual_asset_files?: Record<string, Uint8Array>;
  // Canvas connections (ADR 0021) are deliberately NOT a section here: the
  // guest WebDAV flow's two workspace sections are pinned by its own
  // contract, and widening them is its own ticket. See ADR 0021.
}
