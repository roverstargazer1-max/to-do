import { visualClient } from "@/lib/api/visual-client";
import type {
  VisualAnnotation,
  VisualAsset,
  VisualAssetVersion,
  VisualDerivedInfo,
  VisualFlowDraft,
  VisualRelation,
} from "@/lib/types/visual";
import type {
  VisualAssetRecordInput,
  VisualAssetStore,
  VisualStoreState,
  VisualVersionRecordInput,
} from "@/lib/visual/store";

/**
 * SQLite-backed Visual asset store. Metadata rows live in the local database
 * and image bytes live in the local assets directory, so the canvas, the MCP
 * server, and any external SQLite tool all read the same records. The browser
 * talks to the local API routes; server-side callers (tests, scripts) use the
 * repository directly.
 */
export class LocalVisualAssetStore implements VisualAssetStore {
  async listAssets(workspaceId?: string): Promise<VisualAsset[]> {
    return visualClient.listAssets(workspaceId);
  }

  async getAsset(assetId: string): Promise<VisualAsset | null> {
    return visualClient.getAsset(assetId);
  }

  async getAssetIncludingDeleted(assetId: string): Promise<VisualAsset | null> {
    return visualClient.getAsset(assetId, true);
  }

  async getVersion(
    assetId: string,
    versionId?: string,
  ): Promise<VisualAssetVersion | null> {
    return visualClient.getVersion(assetId, versionId);
  }

  async readVersion(assetId: string, versionId?: string): Promise<Uint8Array> {
    return visualClient.readVersionBytes(assetId, versionId);
  }

  async createAsset(input: VisualAssetRecordInput): Promise<VisualAsset> {
    return visualClient.createAsset(input);
  }

  async appendVersion(input: VisualVersionRecordInput): Promise<VisualAsset> {
    return visualClient.appendVersion(input);
  }

  async updateAsset(asset: VisualAsset): Promise<VisualAsset> {
    return visualClient.updateAsset(asset);
  }

  async removeAsset(assetId: string): Promise<void> {
    return visualClient.removeAsset(assetId);
  }

  async listAnnotations(
    assetId: string,
    versionId?: string,
  ): Promise<VisualAnnotation[]> {
    return visualClient.listAnnotations(assetId, versionId);
  }

  async putAnnotation(annotation: VisualAnnotation): Promise<VisualAnnotation> {
    return visualClient.putAnnotation(annotation);
  }

  async removeAnnotation(annotationId: string): Promise<void> {
    return visualClient.removeAnnotation(annotationId);
  }

  async listDerived(
    assetId: string,
    versionId?: string,
  ): Promise<VisualDerivedInfo[]> {
    return visualClient.listDerived(assetId, versionId);
  }

  async putDerived(derived: VisualDerivedInfo): Promise<VisualDerivedInfo> {
    return visualClient.putDerived(derived);
  }

  async listRelations(workspaceId: string): Promise<VisualRelation[]> {
    return visualClient.listRelations(workspaceId);
  }

  async putRelation(relation: VisualRelation): Promise<VisualRelation> {
    return visualClient.putRelation(relation);
  }

  async removeRelation(relationId: string): Promise<void> {
    return visualClient.removeRelation(relationId);
  }

  async listDrafts(workspaceId: string): Promise<VisualFlowDraft[]> {
    return visualClient.listDrafts(workspaceId);
  }

  async getDraft(draftId: string): Promise<VisualFlowDraft | null> {
    return visualClient.getDraft(draftId);
  }

  async putDraft(draft: VisualFlowDraft): Promise<VisualFlowDraft> {
    return visualClient.putDraft(draft);
  }

  async clearAll(): Promise<void> {
    return visualClient.clearAll();
  }

  async exportState(): Promise<VisualStoreState> {
    const assets = await visualClient.listAssets(undefined, true);
    const versions: VisualAssetVersion[] = [];
    const annotations: VisualAnnotation[] = [];
    const derived: VisualDerivedInfo[] = [];

    for (const asset of assets) {
      const assetVersions = await this.listVersions(asset.id);
      for (const version of assetVersions) {
        const data = await visualClient.readVersionBytes(asset.id, version.id);
        versions.push({ ...version, data });
      }
      annotations.push(...(await visualClient.listAnnotations(asset.id)));
      derived.push(...(await visualClient.listDerived(asset.id)));
    }

    return {
      assets,
      versions,
      annotations,
      derived,
      relations: await visualClient.listRelations("", true),
      drafts: await visualClient.listDrafts("", true),
    };
  }

  async importState(state: VisualStoreState): Promise<void> {
    for (const asset of state.assets) {
      const versions = state.versions.filter(
        (version) => version.asset_id === asset.id,
      );
      const current = versions.find(
        (version) => version.id === asset.current_version_id,
      );
      if (!current || !current.data) {
        throw new Error(
          `Visual asset "${asset.id}" has no readable current version.`,
        );
      }
      const existing = await this.getAssetIncludingDeleted(asset.id);
      if (existing) {
        await visualClient.updateAsset(asset);
        if (!(await this.getVersion(asset.id, current.id))) {
          await visualClient.appendVersion({
            asset,
            version: current,
            bytes: current.data,
          });
        }
      } else {
        await visualClient.createAsset({
          asset,
          version: current,
          bytes: current.data,
        });
      }
      for (const version of versions) {
        if (version.id === current.id || !version.data) continue;
        if (await this.getVersion(asset.id, version.id)) continue;
        await visualClient.appendVersion({
          asset: { ...asset, current_version_id: version.id },
          version,
          bytes: version.data,
        });
      }
      await visualClient.updateAsset(asset);
    }

    for (const annotation of state.annotations) {
      await visualClient.putAnnotation(annotation);
    }
    for (const record of state.derived) {
      await visualClient.putDerived(record);
    }
    const existingRelations = new Set(
      (await visualClient.listRelations("", true)).map((item) => item.id),
    );
    for (const relation of state.relations) {
      if (existingRelations.has(relation.id)) continue;
      await visualClient.putRelation(relation);
    }
    for (const draft of state.drafts) {
      await visualClient.putDraft(draft);
    }
  }

  private async listVersions(assetId: string): Promise<VisualAssetVersion[]> {
    return visualClient.listVersions(assetId);
  }
}

export const localVisualAssetStore = new LocalVisualAssetStore();
