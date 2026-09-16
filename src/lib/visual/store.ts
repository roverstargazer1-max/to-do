import type {
  VisualAnnotation,
  VisualAsset,
  VisualAssetVersion,
  VisualDerivedInfo,
  VisualFlowDraft,
  VisualRelation,
} from "@/lib/types/visual";

export interface VisualStoreState {
  assets: VisualAsset[];
  versions: VisualAssetVersion[];
  annotations: VisualAnnotation[];
  derived: VisualDerivedInfo[];
  relations: VisualRelation[];
  drafts: VisualFlowDraft[];
}

export interface VisualAssetRecordInput {
  asset: VisualAsset;
  version: VisualAssetVersion;
  bytes: Uint8Array;
}

export interface VisualVersionRecordInput {
  asset: VisualAsset;
  version: VisualAssetVersion;
  bytes: Uint8Array;
}

export interface VisualAssetStore {
  listAssets(workspaceId?: string): Promise<VisualAsset[]>;
  getAsset(assetId: string): Promise<VisualAsset | null>;
  /** Lifecycle-only read; ordinary reads hide soft-deleted assets. */
  getAssetIncludingDeleted?(assetId: string): Promise<VisualAsset | null>;
  getVersion(
    assetId: string,
    versionId?: string,
  ): Promise<VisualAssetVersion | null>;
  readVersion(assetId: string, versionId?: string): Promise<Uint8Array>;
  createAsset(input: VisualAssetRecordInput): Promise<VisualAsset>;
  appendVersion(input: VisualVersionRecordInput): Promise<VisualAsset>;
  updateAsset(asset: VisualAsset): Promise<VisualAsset>;
  removeAsset(assetId: string): Promise<void>;
  listAnnotations(
    assetId: string,
    versionId?: string,
  ): Promise<VisualAnnotation[]>;
  putAnnotation(annotation: VisualAnnotation): Promise<VisualAnnotation>;
  removeAnnotation(annotationId: string): Promise<void>;
  listDerived(
    assetId: string,
    versionId?: string,
  ): Promise<VisualDerivedInfo[]>;
  putDerived(derived: VisualDerivedInfo): Promise<VisualDerivedInfo>;
  listRelations(workspaceId: string): Promise<VisualRelation[]>;
  putRelation(relation: VisualRelation): Promise<VisualRelation>;
  removeRelation(relationId: string): Promise<void>;
  listDrafts(workspaceId: string): Promise<VisualFlowDraft[]>;
  getDraft(draftId: string): Promise<VisualFlowDraft | null>;
  putDraft(draft: VisualFlowDraft): Promise<VisualFlowDraft>;
  clearAll(): Promise<void>;
  exportState(): Promise<VisualStoreState>;
  importState(state: VisualStoreState): Promise<void>;
}

function clone<T>(value: T): T {
  if (value instanceof Uint8Array) return value.slice() as T;
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        clone(item),
      ]),
    ) as T;
  }
  return value;
}

function cloneState(state: VisualStoreState): VisualStoreState {
  return clone(state);
}

function ensureVersionBytes(version: VisualAssetVersion): Uint8Array {
  if (!version.data) {
    throw new Error(
      `Visual asset version "${version.id}" has no readable bytes.`,
    );
  }
  return version.data.slice();
}

/**
 * Process-local adapter used by the MCP contract tests and by embedded
 * callers. It follows the same append-only version semantics as the real
 * adapters and never exposes its mutable arrays.
 */
export class InMemoryVisualAssetStore implements VisualAssetStore {
  private state: VisualStoreState;

  constructor(initial: Partial<VisualStoreState> = {}) {
    this.state = {
      assets: clone(initial.assets ?? []),
      versions: clone(initial.versions ?? []),
      annotations: clone(initial.annotations ?? []),
      derived: clone(initial.derived ?? []),
      relations: clone(initial.relations ?? []),
      drafts: clone(initial.drafts ?? []),
    };
  }

  async listAssets(workspaceId?: string): Promise<VisualAsset[]> {
    return this.state.assets
      .filter((asset) => !workspaceId || asset.workspace_id === workspaceId)
      .filter((asset) => asset.status !== "deleted")
      .map(clone);
  }

  async getAsset(assetId: string): Promise<VisualAsset | null> {
    const asset = this.state.assets.find((item) => item.id === assetId);
    return asset && asset.status !== "deleted" ? clone(asset) : null;
  }

  async getAssetIncludingDeleted(assetId: string): Promise<VisualAsset | null> {
    const asset = this.state.assets.find((item) => item.id === assetId);
    return asset ? clone(asset) : null;
  }

  async getVersion(
    assetId: string,
    versionId?: string,
  ): Promise<VisualAssetVersion | null> {
    const asset = this.state.assets.find((item) => item.id === assetId);
    const id = versionId ?? asset?.current_version_id;
    const version = this.state.versions.find(
      (item) => item.asset_id === assetId && item.id === id,
    );
    return version ? clone(version) : null;
  }

  async readVersion(assetId: string, versionId?: string): Promise<Uint8Array> {
    const version = await this.getVersion(assetId, versionId);
    if (!version)
      throw new Error(`Visual asset version for "${assetId}" was not found.`);
    return ensureVersionBytes(version);
  }

  async createAsset(input: VisualAssetRecordInput): Promise<VisualAsset> {
    if (this.state.assets.some((item) => item.id === input.asset.id)) {
      throw new Error(`Visual asset "${input.asset.id}" already exists.`);
    }
    if (this.state.versions.some((item) => item.id === input.version.id)) {
      throw new Error(
        `Visual asset version "${input.version.id}" already exists.`,
      );
    }
    const asset = clone(input.asset);
    const version = { ...clone(input.version), data: input.bytes.slice() };
    this.state.assets.push(asset);
    this.state.versions.push(version);
    return clone(asset);
  }

  async appendVersion(input: VisualVersionRecordInput): Promise<VisualAsset> {
    const index = this.state.assets.findIndex(
      (item) => item.id === input.asset.id,
    );
    if (index === -1)
      throw new Error(`Visual asset "${input.asset.id}" was not found.`);
    if (this.state.versions.some((item) => item.id === input.version.id)) {
      throw new Error(
        `Visual asset version "${input.version.id}" already exists.`,
      );
    }
    this.state.assets[index] = clone(input.asset);
    this.state.versions.push({
      ...clone(input.version),
      data: input.bytes.slice(),
    });
    return clone(this.state.assets[index]);
  }

  async updateAsset(asset: VisualAsset): Promise<VisualAsset> {
    const index = this.state.assets.findIndex((item) => item.id === asset.id);
    if (index === -1)
      throw new Error(`Visual asset "${asset.id}" was not found.`);
    this.state.assets[index] = clone(asset);
    return clone(this.state.assets[index]);
  }

  async removeAsset(assetId: string): Promise<void> {
    this.state.assets = this.state.assets.filter((item) => item.id !== assetId);
    this.state.versions = this.state.versions.filter(
      (item) => item.asset_id !== assetId,
    );
    this.state.annotations = this.state.annotations.filter(
      (item) => item.asset_id !== assetId,
    );
    this.state.derived = this.state.derived.filter(
      (item) => item.asset_id !== assetId,
    );
    this.state.relations = this.state.relations.filter(
      (item) =>
        !(item.source_type === "visual_asset" && item.source_id === assetId) &&
        !(item.target_type === "visual_asset" && item.target_id === assetId),
    );
  }

  async listAnnotations(
    assetId: string,
    versionId?: string,
  ): Promise<VisualAnnotation[]> {
    return this.state.annotations
      .filter(
        (item) =>
          item.asset_id === assetId &&
          (!versionId || item.version_id === versionId),
      )
      .map(clone);
  }

  async putAnnotation(annotation: VisualAnnotation): Promise<VisualAnnotation> {
    const index = this.state.annotations.findIndex(
      (item) => item.id === annotation.id,
    );
    if (index === -1) this.state.annotations.push(clone(annotation));
    else this.state.annotations[index] = clone(annotation);
    return clone(annotation);
  }

  async removeAnnotation(annotationId: string): Promise<void> {
    this.state.annotations = this.state.annotations.filter(
      (item) => item.id !== annotationId,
    );
  }

  async listDerived(
    assetId: string,
    versionId?: string,
  ): Promise<VisualDerivedInfo[]> {
    return this.state.derived
      .filter(
        (item) =>
          item.asset_id === assetId &&
          (!versionId || item.version_id === versionId),
      )
      .map(clone);
  }

  async putDerived(derived: VisualDerivedInfo): Promise<VisualDerivedInfo> {
    const index = this.state.derived.findIndex(
      (item) => item.id === derived.id,
    );
    if (index === -1) this.state.derived.push(clone(derived));
    else this.state.derived[index] = clone(derived);
    return clone(derived);
  }

  async listRelations(workspaceId: string): Promise<VisualRelation[]> {
    return this.state.relations
      .filter((item) => item.workspace_id === workspaceId)
      .map(clone);
  }

  async putRelation(relation: VisualRelation): Promise<VisualRelation> {
    const index = this.state.relations.findIndex(
      (item) => item.id === relation.id,
    );
    if (index === -1) this.state.relations.push(clone(relation));
    else this.state.relations[index] = clone(relation);
    return clone(relation);
  }

  async removeRelation(relationId: string): Promise<void> {
    this.state.relations = this.state.relations.filter(
      (item) => item.id !== relationId,
    );
  }

  async listDrafts(workspaceId: string): Promise<VisualFlowDraft[]> {
    return this.state.drafts
      .filter((item) => item.workspace_id === workspaceId)
      .map(clone);
  }

  async getDraft(draftId: string): Promise<VisualFlowDraft | null> {
    const draft = this.state.drafts.find((item) => item.id === draftId);
    return draft ? clone(draft) : null;
  }

  async putDraft(draft: VisualFlowDraft): Promise<VisualFlowDraft> {
    const index = this.state.drafts.findIndex((item) => item.id === draft.id);
    if (index === -1) this.state.drafts.push(clone(draft));
    else this.state.drafts[index] = clone(draft);
    return clone(draft);
  }

  async clearAll(): Promise<void> {
    this.state = {
      assets: [],
      versions: [],
      annotations: [],
      derived: [],
      relations: [],
      drafts: [],
    };
  }

  async exportState(): Promise<VisualStoreState> {
    return cloneState(this.state);
  }

  /**
   * Synchronous snapshot for process-local integrations such as the MCP mock
   * backend. Production adapters should use the async VisualAssetStore API.
   */
  getState(): VisualStoreState {
    return cloneState(this.state);
  }

  async importState(state: VisualStoreState): Promise<void> {
    this.state = cloneState(state);
  }
}

export function cloneVisualStoreState(
  state: VisualStoreState,
): VisualStoreState {
  return cloneState(state);
}
