import type Database from "better-sqlite3";
import { getDatabase } from "../index";
import { assetService } from "@/lib/assets/asset-service";
import type {
  VisualAnnotation,
  VisualAsset,
  VisualAssetSource,
  VisualAssetStatus,
  VisualAssetVersion,
  VisualDerivedInfo,
  VisualFlowDraft,
  VisualRelation,
} from "@/lib/types/visual";
import type {
  VisualAssetRecordInput,
  VisualVersionRecordInput,
} from "@/lib/visual/store";

interface DbAssetRow {
  id: string;
  hash: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  width: number | null;
  height: number | null;
  file_path: string;
  created_at: string;
  user_id: string | null;
  workspace_id: string | null;
  current_version_id: string | null;
  source: string | null;
  source_uri: string | null;
  title: string | null;
  alt_text: string | null;
  status: string | null;
  version_count: number | null;
  updated_at: string | null;
  deleted_at: string | null;
  metadata: string | null;
}

interface DbVersionRow {
  id: string;
  asset_id: string;
  user_id: string;
  version_number: number;
  mime_type: string;
  byte_size: number;
  width: number;
  height: number;
  sha256: string;
  storage_key: string | null;
  source: string;
  source_uri: string | null;
  source_asset_id: string | null;
  replaced_version_id: string | null;
  created_by: string | null;
  created_at: string;
}

interface DbAnnotationRow {
  id: string;
  workspace_id: string;
  asset_id: string;
  version_id: string;
  type: string;
  geometry: string;
  text: string | null;
  confidence: number | null;
  source: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface DbDerivedRow {
  id: string;
  asset_id: string;
  version_id: string;
  kind: string;
  value: string;
  confidence: number | null;
  source: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface DbRelationRow {
  id: string;
  workspace_id: string;
  user_id: string;
  relation_type: string;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  source_version_id: string | null;
  target_version_id: string | null;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface DbDraftRow {
  id: string;
  workspace_id: string;
  source_asset_id: string;
  source_node_id: string | null;
  source_version_id: string;
  status: string;
  nodes: string;
  edges: string;
  confidence: number | null;
  uncertainties: string;
  provenance: string | null;
  created_by: string;
  request_id: string | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
}

function mapAsset(row: DbAssetRow): VisualAsset {
  return {
    id: row.id,
    user_id: row.user_id || "local_user",
    workspace_id: row.workspace_id ?? null,
    current_version_id: row.current_version_id ?? "",
    mime_type: row.mime_type,
    byte_size: row.file_size,
    width: row.width ?? 0,
    height: row.height ?? 0,
    sha256: row.hash,
    source: (row.source as VisualAssetSource) || "upload",
    source_uri: row.source_uri ?? null,
    title: row.title ?? null,
    alt_text: row.alt_text ?? null,
    status: (row.status as VisualAssetStatus) || "active",
    version_count: row.version_count ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
    deleted_at: row.deleted_at ?? null,
    metadata: row.metadata
      ? (JSON.parse(row.metadata) as Record<string, unknown>)
      : null,
  };
}

function mapVersion(row: DbVersionRow): VisualAssetVersion {
  return {
    id: row.id,
    asset_id: row.asset_id,
    user_id: row.user_id,
    version_number: row.version_number,
    mime_type: row.mime_type,
    byte_size: row.byte_size,
    width: row.width,
    height: row.height,
    sha256: row.sha256,
    storage_key: row.storage_key ?? `${row.user_id}/${row.asset_id}/${row.id}`,
    source: (row.source as VisualAssetSource) || "upload",
    source_uri: row.source_uri ?? null,
    source_asset_id: row.source_asset_id ?? null,
    replaced_version_id: row.replaced_version_id ?? null,
    created_by: row.created_by ?? row.user_id,
    created_at: row.created_at,
  };
}

function mapAnnotation(row: DbAnnotationRow): VisualAnnotation {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    asset_id: row.asset_id,
    version_id: row.version_id,
    type: row.type as VisualAnnotation["type"],
    geometry: JSON.parse(row.geometry) as VisualAnnotation["geometry"],
    text: row.text ?? null,
    confidence: row.confidence ?? null,
    source: row.source as VisualAnnotation["source"],
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapDerived(row: DbDerivedRow): VisualDerivedInfo {
  return {
    id: row.id,
    asset_id: row.asset_id,
    version_id: row.version_id,
    kind: row.kind as VisualDerivedInfo["kind"],
    value: JSON.parse(row.value) as VisualDerivedInfo["value"],
    confidence: row.confidence ?? null,
    source: row.source as VisualDerivedInfo["source"],
    status: row.status as VisualDerivedInfo["status"],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapRelation(row: DbRelationRow): VisualRelation {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    relation_type: row.relation_type as VisualRelation["relation_type"],
    source_type: row.source_type as VisualRelation["source_type"],
    source_id: row.source_id,
    target_type: row.target_type as VisualRelation["target_type"],
    target_id: row.target_id,
    source_version_id: row.source_version_id ?? null,
    target_version_id: row.target_version_id ?? null,
    description: row.description ?? null,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapDraft(row: DbDraftRow): VisualFlowDraft {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    source_asset_id: row.source_asset_id,
    source_node_id: row.source_node_id ?? null,
    source_version_id: row.source_version_id,
    status: row.status as VisualFlowDraft["status"],
    nodes: JSON.parse(row.nodes) as VisualFlowDraft["nodes"],
    edges: JSON.parse(row.edges) as VisualFlowDraft["edges"],
    confidence: row.confidence ?? null,
    uncertainties: JSON.parse(row.uncertainties) as string[],
    provenance: row.provenance
      ? (JSON.parse(row.provenance) as Record<string, unknown>)
      : null,
    created_by: row.created_by,
    request_id: row.request_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    confirmed_at: row.confirmed_at ?? null,
  };
}

/**
 * SQLite repository for the Visual asset domain. Bytes are content-addressed
 * files on disk (shared by hash); every row here is metadata, which keeps the
 * database small and lets any SQLite tool inspect the records directly.
 */
export class VisualRepository {
  constructor(private db?: Database.Database) {}

  private get connection(): Database.Database {
    return this.db || getDatabase();
  }

  listAssets(workspaceId?: string, includeDeleted = false): VisualAsset[] {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (workspaceId) {
      conditions.push("workspace_id = ?");
      params.push(workspaceId);
    }
    if (!includeDeleted) {
      conditions.push("status != 'deleted'");
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.connection
      .prepare(`SELECT * FROM visual_assets ${where} ORDER BY created_at ASC`)
      .all(...params) as DbAssetRow[];
    return rows.map(mapAsset);
  }

  getAsset(assetId: string, includeDeleted = false): VisualAsset | null {
    const row = this.connection
      .prepare(`SELECT * FROM visual_assets WHERE id = ?`)
      .get(assetId) as DbAssetRow | undefined;
    if (!row) return null;
    const asset = mapAsset(row);
    if (!includeDeleted && asset.status === "deleted") return null;
    return asset;
  }

  getVersion(assetId: string, versionId?: string): VisualAssetVersion | null {
    const id =
      versionId ?? this.getAsset(assetId, true)?.current_version_id ?? null;
    if (!id) return null;
    const row = this.connection
      .prepare(
        `SELECT * FROM visual_asset_versions WHERE asset_id = ? AND id = ?`,
      )
      .get(assetId, id) as DbVersionRow | undefined;
    return row ? mapVersion(row) : null;
  }

  listVersions(assetId: string): VisualAssetVersion[] {
    const rows = this.connection
      .prepare(
        `SELECT * FROM visual_asset_versions WHERE asset_id = ? ORDER BY version_number ASC`,
      )
      .all(assetId) as DbVersionRow[];
    return rows.map(mapVersion);
  }

  readVersionBytes(assetId: string, versionId?: string): Uint8Array {
    const version = this.getVersion(assetId, versionId);
    if (!version) {
      throw new Error(`Visual asset version for "${assetId}" was not found.`);
    }
    const bytes = assetService.readBytesByHash(version.sha256);
    if (!bytes) {
      throw new Error(
        `Visual asset version "${version.id}" has no bytes on disk.`,
      );
    }
    return new Uint8Array(bytes);
  }

  createAsset(input: VisualAssetRecordInput): VisualAsset {
    if (this.getAsset(input.asset.id, true)) {
      throw new Error(`Visual asset "${input.asset.id}" already exists.`);
    }
    const bytes = Buffer.from(input.bytes);
    const stored = assetService.persistBytes(
      bytes,
      `${input.asset.sha256}`,
      input.asset.mime_type,
    );
    const now = input.asset.created_at || new Date().toISOString();

    const insert = this.connection.transaction(() => {
      this.connection
        .prepare(
          `INSERT INTO visual_assets (
            id, hash, file_name, mime_type, file_size, width, height, file_path, created_at,
            user_id, workspace_id, current_version_id, source, source_uri, title, alt_text,
            status, version_count, updated_at, deleted_at, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.asset.id,
          stored.hash,
          stored.fileName,
          input.asset.mime_type,
          input.asset.byte_size,
          input.asset.width,
          input.asset.height,
          stored.fileName,
          now,
          input.asset.user_id || "local_user",
          input.asset.workspace_id ?? null,
          input.asset.current_version_id,
          input.asset.source,
          input.asset.source_uri ?? null,
          input.asset.title ?? null,
          input.asset.alt_text ?? null,
          input.asset.status,
          input.asset.version_count,
          input.asset.updated_at || now,
          input.asset.deleted_at ?? null,
          input.asset.metadata ? JSON.stringify(input.asset.metadata) : null,
        );
      this.insertVersion(input.version);
    });
    insert();

    return this.getAsset(input.asset.id, true)!;
  }

  appendVersion(input: VisualVersionRecordInput): VisualAsset {
    const existing = this.getAsset(input.asset.id, true);
    if (!existing) {
      throw new Error(`Visual asset "${input.asset.id}" was not found.`);
    }
    const bytes = Buffer.from(input.bytes);
    const stored = assetService.persistBytes(
      bytes,
      `${input.version.sha256}`,
      input.version.mime_type,
    );

    const apply = this.connection.transaction(() => {
      this.insertVersion(input.version);
      this.connection
        .prepare(
          `UPDATE visual_assets SET
             hash = ?, file_name = ?, mime_type = ?, file_size = ?, width = ?, height = ?,
             file_path = ?, current_version_id = ?, version_count = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          stored.hash,
          stored.fileName,
          input.asset.mime_type,
          input.asset.byte_size,
          input.asset.width,
          input.asset.height,
          stored.fileName,
          input.asset.current_version_id,
          input.asset.version_count,
          input.asset.updated_at || new Date().toISOString(),
          input.asset.id,
        );
    });
    apply();

    return this.getAsset(input.asset.id, true)!;
  }

  updateAsset(asset: VisualAsset): VisualAsset {
    const existing = this.getAsset(asset.id, true);
    if (!existing) {
      throw new Error(`Visual asset "${asset.id}" was not found.`);
    }
    this.connection
      .prepare(
        `UPDATE visual_assets SET
           hash = ?, mime_type = ?, file_size = ?, width = ?, height = ?,
           workspace_id = ?, current_version_id = ?, source = ?, source_uri = ?,
           title = ?, alt_text = ?, status = ?, version_count = ?, updated_at = ?,
           deleted_at = ?, metadata = ?
         WHERE id = ?`,
      )
      .run(
        asset.sha256,
        asset.mime_type,
        asset.byte_size,
        asset.width,
        asset.height,
        asset.workspace_id ?? null,
        asset.current_version_id,
        asset.source,
        asset.source_uri ?? null,
        asset.title ?? null,
        asset.alt_text ?? null,
        asset.status,
        asset.version_count,
        asset.updated_at,
        asset.deleted_at ?? null,
        asset.metadata ? JSON.stringify(asset.metadata) : null,
        asset.id,
      );

    return this.getAsset(asset.id, true)!;
  }

  /** Hard removal: versions, annotations, and derived rows cascade in SQLite. */
  removeAsset(assetId: string): void {
    const remove = this.connection.transaction(() => {
      this.connection
        .prepare(
          `DELETE FROM visual_relations
           WHERE (source_type = 'visual_asset' AND source_id = ?)
              OR (target_type = 'visual_asset' AND target_id = ?)`,
        )
        .run(assetId, assetId);
      this.connection
        .prepare(`DELETE FROM visual_flow_drafts WHERE source_asset_id = ?`)
        .run(assetId);
      this.connection
        .prepare(`DELETE FROM visual_assets WHERE id = ?`)
        .run(assetId);
    });
    remove();
  }

  listAnnotations(assetId: string, versionId?: string): VisualAnnotation[] {
    const rows = this.connection
      .prepare(
        `SELECT * FROM visual_annotations
         WHERE asset_id = ? AND (? IS NULL OR version_id = ?)
         ORDER BY created_at ASC`,
      )
      .all(assetId, versionId ?? null, versionId ?? null) as DbAnnotationRow[];
    return rows.map(mapAnnotation);
  }

  putAnnotation(annotation: VisualAnnotation): VisualAnnotation {
    this.connection
      .prepare(
        `INSERT INTO visual_annotations (
           id, workspace_id, asset_id, version_id, type, geometry, text, confidence,
           source, created_by, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           workspace_id = excluded.workspace_id,
           asset_id = excluded.asset_id,
           version_id = excluded.version_id,
           type = excluded.type,
           geometry = excluded.geometry,
           text = excluded.text,
           confidence = excluded.confidence,
           source = excluded.source,
           updated_at = excluded.updated_at`,
      )
      .run(
        annotation.id,
        annotation.workspace_id,
        annotation.asset_id,
        annotation.version_id,
        annotation.type,
        JSON.stringify(annotation.geometry),
        annotation.text ?? null,
        annotation.confidence ?? null,
        annotation.source,
        annotation.created_by,
        annotation.created_at,
        annotation.updated_at,
      );
    return annotation;
  }

  removeAnnotation(annotationId: string): void {
    this.connection
      .prepare(`DELETE FROM visual_annotations WHERE id = ?`)
      .run(annotationId);
  }

  listDerived(assetId: string, versionId?: string): VisualDerivedInfo[] {
    const rows = this.connection
      .prepare(
        `SELECT * FROM visual_derived
         WHERE asset_id = ? AND (? IS NULL OR version_id = ?)
         ORDER BY created_at ASC`,
      )
      .all(assetId, versionId ?? null, versionId ?? null) as DbDerivedRow[];
    return rows.map(mapDerived);
  }

  putDerived(derived: VisualDerivedInfo): VisualDerivedInfo {
    this.connection
      .prepare(
        `INSERT INTO visual_derived (
           id, asset_id, version_id, kind, value, confidence, source, status,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           asset_id = excluded.asset_id,
           version_id = excluded.version_id,
           kind = excluded.kind,
           value = excluded.value,
           confidence = excluded.confidence,
           source = excluded.source,
           status = excluded.status,
           updated_at = excluded.updated_at`,
      )
      .run(
        derived.id,
        derived.asset_id,
        derived.version_id,
        derived.kind,
        JSON.stringify(derived.value),
        derived.confidence ?? null,
        derived.source,
        derived.status,
        derived.created_at,
        derived.updated_at,
      );
    return derived;
  }

  listRelations(workspaceId: string): VisualRelation[] {
    const rows = this.connection
      .prepare(
        `SELECT * FROM visual_relations WHERE workspace_id = ? ORDER BY created_at ASC`,
      )
      .all(workspaceId) as DbRelationRow[];
    return rows.map(mapRelation);
  }

  listAllRelations(): VisualRelation[] {
    const rows = this.connection
      .prepare(`SELECT * FROM visual_relations ORDER BY created_at ASC`)
      .all() as DbRelationRow[];
    return rows.map(mapRelation);
  }

  putRelation(relation: VisualRelation): VisualRelation {
    this.connection
      .prepare(
        `INSERT INTO visual_relations (
           id, workspace_id, user_id, relation_type, source_type, source_id,
           target_type, target_id, source_version_id, target_version_id,
           description, created_by, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           relation_type = excluded.relation_type,
           source_type = excluded.source_type,
           source_id = excluded.source_id,
           target_type = excluded.target_type,
           target_id = excluded.target_id,
           source_version_id = excluded.source_version_id,
           target_version_id = excluded.target_version_id,
           description = excluded.description,
           updated_at = excluded.updated_at`,
      )
      .run(
        relation.id,
        relation.workspace_id,
        relation.user_id,
        relation.relation_type,
        relation.source_type,
        relation.source_id,
        relation.target_type,
        relation.target_id,
        relation.source_version_id ?? null,
        relation.target_version_id ?? null,
        relation.description ?? null,
        relation.created_by,
        relation.created_at,
        relation.updated_at,
      );
    return relation;
  }

  removeRelation(relationId: string): void {
    this.connection
      .prepare(`DELETE FROM visual_relations WHERE id = ?`)
      .run(relationId);
  }

  listDrafts(workspaceId: string): VisualFlowDraft[] {
    const rows = this.connection
      .prepare(
        `SELECT * FROM visual_flow_drafts WHERE workspace_id = ? ORDER BY created_at ASC`,
      )
      .all(workspaceId) as DbDraftRow[];
    return rows.map(mapDraft);
  }

  listAllDrafts(): VisualFlowDraft[] {
    const rows = this.connection
      .prepare(`SELECT * FROM visual_flow_drafts ORDER BY created_at ASC`)
      .all() as DbDraftRow[];
    return rows.map(mapDraft);
  }

  getDraft(draftId: string): VisualFlowDraft | null {
    const row = this.connection
      .prepare(`SELECT * FROM visual_flow_drafts WHERE id = ?`)
      .get(draftId) as DbDraftRow | undefined;
    return row ? mapDraft(row) : null;
  }

  putDraft(draft: VisualFlowDraft): VisualFlowDraft {
    this.connection
      .prepare(
        `INSERT INTO visual_flow_drafts (
           id, workspace_id, source_asset_id, source_node_id, source_version_id,
           status, nodes, edges, confidence, uncertainties, provenance,
           created_by, request_id, created_at, updated_at, confirmed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           source_node_id = excluded.source_node_id,
           source_version_id = excluded.source_version_id,
           status = excluded.status,
           nodes = excluded.nodes,
           edges = excluded.edges,
           confidence = excluded.confidence,
           uncertainties = excluded.uncertainties,
           provenance = excluded.provenance,
           request_id = excluded.request_id,
           updated_at = excluded.updated_at,
           confirmed_at = excluded.confirmed_at`,
      )
      .run(
        draft.id,
        draft.workspace_id,
        draft.source_asset_id,
        draft.source_node_id ?? null,
        draft.source_version_id,
        draft.status,
        JSON.stringify(draft.nodes),
        JSON.stringify(draft.edges),
        draft.confidence ?? null,
        JSON.stringify(draft.uncertainties ?? []),
        draft.provenance ? JSON.stringify(draft.provenance) : null,
        draft.created_by,
        draft.request_id ?? null,
        draft.created_at,
        draft.updated_at,
        draft.confirmed_at ?? null,
      );
    return draft;
  }

  clearAll(): void {
    const clear = this.connection.transaction(() => {
      this.connection.prepare(`DELETE FROM visual_flow_drafts`).run();
      this.connection.prepare(`DELETE FROM visual_relations`).run();
      this.connection.prepare(`DELETE FROM visual_derived`).run();
      this.connection.prepare(`DELETE FROM visual_annotations`).run();
      this.connection.prepare(`DELETE FROM visual_asset_versions`).run();
      this.connection.prepare(`DELETE FROM visual_assets`).run();
    });
    clear();
  }

  private insertVersion(version: VisualAssetVersion): void {
    this.connection
      .prepare(
        `INSERT INTO visual_asset_versions (
           id, asset_id, user_id, version_number, mime_type, byte_size, width, height,
           sha256, storage_key, source, source_uri, source_asset_id, replaced_version_id,
           created_by, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        version.id,
        version.asset_id,
        version.user_id || "local_user",
        version.version_number,
        version.mime_type,
        version.byte_size,
        version.width,
        version.height,
        version.sha256,
        version.storage_key ?? null,
        version.source,
        version.source_uri ?? null,
        version.source_asset_id ?? null,
        version.replaced_version_id ?? null,
        version.created_by ?? null,
        version.created_at,
      );
  }
}

export const visualRepository = new VisualRepository();
