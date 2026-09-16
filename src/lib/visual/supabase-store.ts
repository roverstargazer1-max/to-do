import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/paginate";
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

const VISUAL_BUCKET = "visual-assets";

function withoutData(version: VisualAssetVersion): Record<string, unknown> {
  const { data: _data, ...record } = version;
  return record;
}

function toBlob(bytes: Uint8Array, mimeType: string): Blob {
  return new Blob(
    [
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
    ],
    { type: mimeType },
  );
}

/** Supabase metadata + Storage adapter for Registered accounts. */
export class SupabaseVisualAssetStore implements VisualAssetStore {
  constructor(private readonly client: SupabaseClient) {}

  private async listAssetRows(workspaceId?: string): Promise<VisualAsset[]> {
    return fetchAllRows<VisualAsset>((from, to) => {
      let query = this.client.from("visual_assets").select("*");
      if (workspaceId) query = query.eq("workspace_id", workspaceId);
      return query.order("created_at", { ascending: true }).range(from, to);
    });
  }

  async listAssets(workspaceId?: string): Promise<VisualAsset[]> {
    const rows = await this.listAssetRows(workspaceId);
    return rows.filter((asset) => asset.status !== "deleted");
  }

  async getAsset(assetId: string): Promise<VisualAsset | null> {
    const { data, error } = await this.client
      .from("visual_assets")
      .select("*")
      .eq("id", assetId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const asset = (data as VisualAsset | null) ?? null;
    return asset?.status === "deleted" ? null : asset;
  }

  async getAssetIncludingDeleted(assetId: string): Promise<VisualAsset | null> {
    const { data, error } = await this.client
      .from("visual_assets")
      .select("*")
      .eq("id", assetId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as VisualAsset | null) ?? null;
  }

  async getVersion(
    assetId: string,
    versionId?: string,
  ): Promise<VisualAssetVersion | null> {
    const asset = await this.getAssetIncludingDeleted(assetId);
    const id = versionId ?? asset?.current_version_id;
    if (!id) return null;
    const { data, error } = await this.client
      .from("visual_asset_versions")
      .select("*")
      .eq("asset_id", assetId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as VisualAssetVersion | null) ?? null;
  }

  async readVersion(assetId: string, versionId?: string): Promise<Uint8Array> {
    const version = await this.getVersion(assetId, versionId);
    if (!version) throw new Error("Visual asset version not found");
    const { data, error } = await this.client.storage
      .from(VISUAL_BUCKET)
      .download(version.storage_key);
    if (error || !data)
      throw new Error(error?.message ?? "Visual asset download failed");
    return new Uint8Array(await data.arrayBuffer());
  }

  async createAsset(input: VisualAssetRecordInput): Promise<VisualAsset> {
    // The asset/version relationship is circular. Insert the asset without
    // its current-version FK, then insert the first immutable version and
    // close the loop with a guarded update.
    const assetPayload = { ...input.asset, current_version_id: null };
    const versionPayload = withoutData(input.version);
    const { error: uploadError } = await this.client.storage
      .from(VISUAL_BUCKET)
      .upload(
        input.version.storage_key,
        toBlob(input.bytes, input.version.mime_type),
        {
          contentType: input.version.mime_type,
          upsert: false,
        },
      );
    if (uploadError) throw new Error(uploadError.message);
    try {
      const { data: asset, error: assetError } = await this.client
        .from("visual_assets")
        .insert(assetPayload)
        .select("*")
        .single();
      if (assetError) throw new Error(assetError.message);
      const { error: versionError } = await this.client
        .from("visual_asset_versions")
        .insert(versionPayload);
      if (versionError) throw new Error(versionError.message);
      const { data: linkedAsset, error: linkError } = await this.client
        .from("visual_assets")
        .update({ current_version_id: input.version.id })
        .eq("id", input.asset.id)
        .is("current_version_id", null)
        .select("*")
        .single();
      if (linkError) throw new Error(linkError.message);
      return (linkedAsset ?? asset) as VisualAsset;
    } catch (error) {
      await this.client.storage
        .from(VISUAL_BUCKET)
        .remove([input.version.storage_key]);
      await this.client
        .from("visual_asset_versions")
        .delete()
        .eq("id", input.version.id);
      await this.client.from("visual_assets").delete().eq("id", input.asset.id);
      throw error;
    }
  }

  async appendVersion(input: VisualVersionRecordInput): Promise<VisualAsset> {
    const versionPayload = withoutData(input.version);
    const { error: uploadError } = await this.client.storage
      .from(VISUAL_BUCKET)
      .upload(
        input.version.storage_key,
        toBlob(input.bytes, input.version.mime_type),
        {
          contentType: input.version.mime_type,
          upsert: false,
        },
      );
    if (uploadError) throw new Error(uploadError.message);
    try {
      const { error: versionError } = await this.client
        .from("visual_asset_versions")
        .insert(versionPayload);
      if (versionError) throw new Error(versionError.message);
      const { data, error } = await this.client
        .from("visual_assets")
        .update(input.asset)
        .eq("id", input.asset.id)
        .eq("current_version_id", input.version.replaced_version_id ?? "")
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as VisualAsset;
    } catch (error) {
      await this.client.storage
        .from(VISUAL_BUCKET)
        .remove([input.version.storage_key]);
      await this.client
        .from("visual_asset_versions")
        .delete()
        .eq("id", input.version.id);
      throw error;
    }
  }

  async updateAsset(asset: VisualAsset): Promise<VisualAsset> {
    const { data, error } = await this.client
      .from("visual_assets")
      .update(asset)
      .eq("id", asset.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as VisualAsset;
  }

  async removeAsset(assetId: string): Promise<void> {
    const versions = await fetchAllRows<{ storage_key: string }>((from, to) =>
      this.client
        .from("visual_asset_versions")
        .select("storage_key")
        .eq("asset_id", assetId)
        .range(from, to),
    );
    const keys = versions.map((item) => String(item.storage_key));
    if (keys.length) await this.client.storage.from(VISUAL_BUCKET).remove(keys);
    const { error } = await this.client
      .from("visual_assets")
      .delete()
      .eq("id", assetId);
    if (error) throw new Error(error.message);
  }

  async listAnnotations(
    assetId: string,
    versionId?: string,
  ): Promise<VisualAnnotation[]> {
    return fetchAllRows<VisualAnnotation>((from, to) => {
      let query = this.client
        .from("visual_annotations")
        .select("*")
        .eq("asset_id", assetId);
      if (versionId) query = query.eq("version_id", versionId);
      return query.order("created_at", { ascending: true }).range(from, to);
    });
  }

  async putAnnotation(annotation: VisualAnnotation): Promise<VisualAnnotation> {
    const { data, error } = await this.client
      .from("visual_annotations")
      .upsert(annotation)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as VisualAnnotation;
  }

  async removeAnnotation(annotationId: string): Promise<void> {
    const { error } = await this.client
      .from("visual_annotations")
      .delete()
      .eq("id", annotationId);
    if (error) throw new Error(error.message);
  }

  async listDerived(
    assetId: string,
    versionId?: string,
  ): Promise<VisualDerivedInfo[]> {
    return fetchAllRows<VisualDerivedInfo>((from, to) => {
      let query = this.client
        .from("visual_derived")
        .select("*")
        .eq("asset_id", assetId);
      if (versionId) query = query.eq("version_id", versionId);
      return query.order("created_at", { ascending: true }).range(from, to);
    });
  }

  async putDerived(derived: VisualDerivedInfo): Promise<VisualDerivedInfo> {
    const { data, error } = await this.client
      .from("visual_derived")
      .upsert(derived)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as VisualDerivedInfo;
  }

  async listRelations(workspaceId: string): Promise<VisualRelation[]> {
    return fetchAllRows<VisualRelation>((from, to) =>
      this.client
        .from("visual_relations")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true })
        .range(from, to),
    );
  }

  async putRelation(relation: VisualRelation): Promise<VisualRelation> {
    const { data, error } = await this.client
      .from("visual_relations")
      .upsert(relation)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as VisualRelation;
  }

  async removeRelation(relationId: string): Promise<void> {
    const { error } = await this.client
      .from("visual_relations")
      .delete()
      .eq("id", relationId);
    if (error) throw new Error(error.message);
  }

  async listDrafts(workspaceId: string): Promise<VisualFlowDraft[]> {
    return fetchAllRows<VisualFlowDraft>((from, to) =>
      this.client
        .from("visual_flow_drafts")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true })
        .range(from, to),
    );
  }

  async getDraft(draftId: string): Promise<VisualFlowDraft | null> {
    const { data, error } = await this.client
      .from("visual_flow_drafts")
      .select("*")
      .eq("id", draftId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as VisualFlowDraft | null) ?? null;
  }

  async putDraft(draft: VisualFlowDraft): Promise<VisualFlowDraft> {
    const { data, error } = await this.client
      .from("visual_flow_drafts")
      .upsert(draft)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as VisualFlowDraft;
  }

  async clearAll(): Promise<void> {
    // Account RLS scopes this operation. The application uses account clear
    // flows for bulk deletion; this adapter deliberately does not issue a
    // broad, unscoped Storage delete.
    const { error } = await this.client
      .from("visual_assets")
      .delete()
      .neq("status", "__never__");
    if (error) throw new Error(error.message);
    const { error: relationError } = await this.client
      .from("visual_relations")
      .delete()
      .neq("id", "__never__");
    if (relationError) throw new Error(relationError.message);
    const { error: draftError } = await this.client
      .from("visual_flow_drafts")
      .delete()
      .neq("id", "__never__");
    if (draftError) throw new Error(draftError.message);
  }

  async exportState(): Promise<VisualStoreState> {
    // Backup is the lifecycle boundary, so include soft-deleted assets and
    // historical versions instead of silently dropping recoverable data.
    const assets = await this.listAssetRows();
    const versions: VisualAssetVersion[] = [];
    for (const asset of assets) {
      const assetVersions = await fetchAllRows<VisualAssetVersion>((from, to) =>
        this.client
          .from("visual_asset_versions")
          .select("*")
          .eq("asset_id", asset.id)
          .order("version_number", { ascending: true })
          .range(from, to),
      );
      for (const version of assetVersions) {
        versions.push({
          ...version,
          data: await this.readVersion(asset.id, version.id),
        });
      }
    }
    const [annotations, derived, relations, drafts] = await Promise.all([
      fetchAllRows<VisualAnnotation>((from, to) =>
        this.client
          .from("visual_annotations")
          .select("*")
          .order("created_at", { ascending: true })
          .range(from, to),
      ),
      fetchAllRows<VisualDerivedInfo>((from, to) =>
        this.client
          .from("visual_derived")
          .select("*")
          .order("created_at", { ascending: true })
          .range(from, to),
      ),
      fetchAllRows<VisualRelation>((from, to) =>
        this.client
          .from("visual_relations")
          .select("*")
          .order("created_at", { ascending: true })
          .range(from, to),
      ),
      fetchAllRows<VisualFlowDraft>((from, to) =>
        this.client
          .from("visual_flow_drafts")
          .select("*")
          .order("created_at", { ascending: true })
          .range(from, to),
      ),
    ]);
    return { assets, versions, annotations, derived, relations, drafts };
  }

  async importState(state: VisualStoreState): Promise<void> {
    for (const asset of state.assets) {
      const versions = state.versions
        .filter((version) => version.asset_id === asset.id)
        .sort((left, right) => left.version_number - right.version_number);
      if (versions.length === 0)
        throw new Error(
          `Backup is missing versions for visual asset "${asset.id}"`,
        );
      // Upsert the row with a null FK first so restores are repeatable even
      // when the destination already contains an earlier copy.
      const { error: assetError } = await this.client
        .from("visual_assets")
        .upsert({ ...asset, current_version_id: null });
      if (assetError) throw new Error(assetError.message);
      for (const version of versions) {
        if (!version.data)
          throw new Error(
            `Backup is missing bytes for visual asset version "${version.id}"`,
          );
        const { error: uploadError } = await this.client.storage
          .from(VISUAL_BUCKET)
          .upload(
            version.storage_key,
            toBlob(version.data, version.mime_type),
            {
              contentType: version.mime_type,
              upsert: true,
            },
          );
        if (uploadError) throw new Error(uploadError.message);
        const { error: versionError } = await this.client
          .from("visual_asset_versions")
          .upsert(withoutData(version));
        if (versionError) throw new Error(versionError.message);
      }
      const currentVersion =
        versions.find((version) => version.id === asset.current_version_id) ??
        versions[versions.length - 1];
      const { error: linkError } = await this.client
        .from("visual_assets")
        .update({
          current_version_id: currentVersion.id,
          version_count: asset.version_count || versions.length,
        })
        .eq("id", asset.id);
      if (linkError) throw new Error(linkError.message);
    }
    for (const annotation of state.annotations)
      await this.putAnnotation(annotation);
    for (const item of state.derived) await this.putDerived(item);
    for (const relation of state.relations) await this.putRelation(relation);
    for (const draft of state.drafts) await this.putDraft(draft);
  }
}
