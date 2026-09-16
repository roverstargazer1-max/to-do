/**
 * Visual objects are deliberately separate from WorkspaceNode rows.  A node
 * is a placement/reference; these records own the immutable bytes, metadata,
 * derived observations and non-executing semantic relations.
 */

export const VISUAL_ASSET_SOURCES = [
  "upload",
  "drop",
  "paste",
  "url",
  "local-file",
  "asset-handle",
  "generated",
  "backup",
  "bridge",
] as const;

export type VisualAssetSource = (typeof VISUAL_ASSET_SOURCES)[number];

export const VISUAL_ASSET_STATUSES = [
  "active",
  "pending_deletion",
  "deleted",
] as const;

export type VisualAssetStatus = (typeof VISUAL_ASSET_STATUSES)[number];

export const VISUAL_ANNOTATION_TYPES = [
  "box",
  "arrow",
  "text",
  "ocr",
  "region",
] as const;

export type VisualAnnotationType = (typeof VISUAL_ANNOTATION_TYPES)[number];

export const VISUAL_RELATION_TYPES = [
  "reference",
  "supports",
  "evidence-for",
  "derived-from",
] as const;

export type VisualRelationType = (typeof VISUAL_RELATION_TYPES)[number];

export const VISUAL_ENDPOINT_TYPES = [
  "visual_asset",
  "image_node",
  "workspace_node",
  "step",
  "decision",
  "doc",
  "task",
  "habit",
  "project",
  "focus",
] as const;

export type VisualEndpointType = (typeof VISUAL_ENDPOINT_TYPES)[number];

export interface VisualAsset {
  id: string;
  user_id: string;
  workspace_id?: string | null;
  current_version_id: string;
  mime_type: string;
  byte_size: number;
  width: number;
  height: number;
  sha256: string;
  source: VisualAssetSource;
  source_uri?: string | null;
  title?: string | null;
  alt_text?: string | null;
  status: VisualAssetStatus;
  version_count: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** An asset version is append-only. `data` exists only in local/fake stores. */
export interface VisualAssetVersion {
  id: string;
  asset_id: string;
  user_id: string;
  version_number: number;
  mime_type: string;
  byte_size: number;
  width: number;
  height: number;
  sha256: string;
  storage_key: string;
  source: VisualAssetSource;
  source_uri?: string | null;
  source_asset_id?: string | null;
  replaced_version_id?: string | null;
  created_by?: string | null;
  created_at: string;
  /** Never serialized into a Workspace node or a blueprint. */
  data?: Uint8Array;
}

export interface VisualDerivedInfo {
  id: string;
  asset_id: string;
  version_id: string;
  kind: "ocr" | "description" | "summary" | "tags" | "comparison";
  value: string | string[] | Record<string, unknown>;
  confidence?: number | null;
  source: "user" | "ai" | "import" | "system";
  status: "ready" | "stale" | "failed";
  created_at: string;
  updated_at: string;
}

export interface VisualAnnotationGeometry {
  /** Coordinates are normalized to the asset's current version (0..1). */
  x: number;
  y: number;
  width?: number;
  height?: number;
  points?: Array<{ x: number; y: number }>;
}

export interface VisualAnnotation {
  id: string;
  workspace_id: string;
  asset_id: string;
  version_id: string;
  type: VisualAnnotationType;
  geometry: VisualAnnotationGeometry;
  text?: string | null;
  confidence?: number | null;
  source: "user" | "ai" | "import";
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface VisualRelation {
  id: string;
  workspace_id: string;
  user_id: string;
  relation_type: VisualRelationType;
  source_type: VisualEndpointType;
  source_id: string;
  target_type: VisualEndpointType;
  target_id: string;
  source_version_id?: string | null;
  target_version_id?: string | null;
  description?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface VisualFlowDraftNode {
  id: string;
  kind: "step" | "decision";
  title: string;
  description?: string;
  position: { x: number; y: number };
  width?: number | null;
  height?: number | null;
  confidence?: number | null;
  sourceRegion?: VisualAnnotationGeometry | null;
}

export interface VisualFlowDraftEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label?: string | null;
  confidence?: number | null;
}

export interface VisualFlowDraft {
  id: string;
  workspace_id: string;
  source_asset_id: string;
  source_node_id?: string | null;
  source_version_id: string;
  status: "pending" | "confirmed" | "rejected" | "stale";
  nodes: VisualFlowDraftNode[];
  edges: VisualFlowDraftEdge[];
  confidence?: number | null;
  uncertainties: string[];
  provenance?: Record<string, unknown> | null;
  created_by: string;
  request_id?: string | null;
  created_at: string;
  updated_at: string;
  confirmed_at?: string | null;
}

export type VisualBytes = Uint8Array | ArrayBuffer | Blob;

export type VisualRepresentation = "thumbnail" | "crop" | "original";

export interface VisualCrop {
  x: number;
  y: number;
  width: number;
  height: number;
  coordinateSpace?: "normalized" | "pixels";
}

export interface VisualTarget {
  workspaceId?: string;
  nodeId?: string;
  assetId?: string;
  resourceId?: string;
  title?: string;
}

export interface VisualInspection {
  asset: VisualAsset;
  version: VisualAssetVersion;
  representation: VisualRepresentation;
  crop?: VisualCrop;
  bytes: Uint8Array;
  transformed: boolean;
  responseMimeType?: string;
  fallback?: {
    kind: "metadata" | "ocr" | "description";
    equivalentToImage: false;
    reason: string;
  };
}

export interface VisualAssetLimits {
  maxBytes: number;
  maxPixels: number;
  maxWidth: number;
  maxHeight: number;
  maxWorkspaceAssets: number;
  maxAnnotationsPerAsset: number;
}

export const DEFAULT_VISUAL_ASSET_LIMITS: VisualAssetLimits = {
  maxBytes: 10 * 1024 * 1024,
  maxPixels: 40_000_000,
  maxWidth: 10_000,
  maxHeight: 10_000,
  maxWorkspaceAssets: 500,
  maxAnnotationsPerAsset: 2_000,
};
