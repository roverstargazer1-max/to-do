import type { BackupData } from "@/lib/backup/types";
import type { VisualAssetVersion } from "@/lib/types/visual";
import type { VisualAssetStore, VisualStoreState } from "@/lib/visual/store";
import { calculateVisualSha256 } from "@/lib/visual/validation";

/** Convert adapter state into JSON metadata plus ZIP-file bytes. */
export async function collectVisualBackupData(
  store: VisualAssetStore,
): Promise<
  Pick<
    BackupData,
    | "visual_assets"
    | "visual_asset_versions"
    | "visual_annotations"
    | "visual_derived"
    | "visual_relations"
    | "visual_flow_drafts"
    | "visual_asset_manifest"
    | "visual_asset_files"
  >
> {
  const state = await store.exportState();
  const visualAssetVersions = state.versions.map((version) => {
    const { data: _data, ...metadata } = version;
    return metadata;
  });
  const visualAssetFiles: Record<string, Uint8Array> = {};
  const visualAssetManifest = [];
  for (const version of state.versions) {
    if (!version.data)
      throw new Error(
        `Visual asset version "${version.id}" has no bytes for Backup.`,
      );
    const digest = await calculateVisualSha256(version.data);
    if (digest !== version.sha256)
      throw new Error(
        `Visual asset version "${version.id}" failed its integrity check.`,
      );
    visualAssetFiles[version.id] = version.data.slice();
    visualAssetManifest.push({
      versionId: version.id,
      assetId: version.asset_id,
      path: `visual-assets/${version.id}.bin`,
      byteSize: version.data.length,
      sha256: version.sha256,
      mimeType: version.mime_type,
    });
  }
  return {
    visual_assets: state.assets,
    visual_asset_versions: visualAssetVersions,
    visual_annotations: state.annotations,
    visual_derived: state.derived,
    visual_relations: state.relations,
    visual_flow_drafts: state.drafts,
    visual_asset_manifest: visualAssetManifest,
    visual_asset_files: visualAssetFiles,
  };
}

/** Rebuild adapter records only after every manifest file is present and hashed. */
export async function restoreVisualBackupData(
  data: Pick<
    BackupData,
    | "visual_assets"
    | "visual_asset_versions"
    | "visual_annotations"
    | "visual_derived"
    | "visual_relations"
    | "visual_flow_drafts"
    | "visual_asset_manifest"
    | "visual_asset_files"
  >,
  store: VisualAssetStore,
): Promise<void> {
  const assets = data.visual_assets ?? [];
  const versions = data.visual_asset_versions ?? [];
  const files = data.visual_asset_files ?? {};
  const manifest = data.visual_asset_manifest ?? [];
  const manifestByVersion = new Map(
    manifest.map((entry) => [entry.versionId, entry]),
  );
  const assetIds = new Set(assets.map((asset) => asset.id));
  if (assets.length > 0 && versions.length === 0) {
    throw new Error(
      "Backup visual asset data is incomplete: asset versions are missing.",
    );
  }
  if (assetIds.size !== assets.length) {
    throw new Error("Backup contains duplicate visual asset IDs.");
  }
  const versionIds = new Set(versions.map((version) => version.id));
  if (versionIds.size !== versions.length) {
    throw new Error("Backup contains duplicate visual asset version IDs.");
  }
  if (
    manifest.length > 0 &&
    (manifest.length !== versions.length ||
      versions.some((version) => !manifestByVersion.has(version.id)))
  ) {
    throw new Error(
      "Backup visual asset manifest does not cover every version.",
    );
  }
  const hydratedVersions: VisualAssetVersion[] = [];
  for (const version of versions) {
    if (!assetIds.has(version.asset_id)) {
      throw new Error(
        `Backup visual asset version "${version.id}" has no asset record.`,
      );
    }
    const entry = manifestByVersion.get(version.id);
    const bytes = files[version.id] ?? (entry ? files[entry.path] : undefined);
    if (!bytes)
      throw new Error(
        `Backup is missing visual asset bytes for version "${version.id}".`,
      );
    if (bytes.length !== version.byte_size)
      throw new Error(
        `Backup visual asset byte size mismatch for version "${version.id}".`,
      );
    const digest = await calculateVisualSha256(bytes);
    if (digest !== version.sha256)
      throw new Error(
        `Backup visual asset hash mismatch for version "${version.id}".`,
      );
    hydratedVersions.push({ ...version, data: bytes.slice() });
  }
  for (const asset of assets) {
    if (
      !versionIds.has(asset.current_version_id) ||
      !versions.some(
        (version) =>
          version.id === asset.current_version_id &&
          version.asset_id === asset.id,
      )
    ) {
      throw new Error(
        `Backup visual asset "${asset.id}" points to a missing current version.`,
      );
    }
  }
  for (const annotation of data.visual_annotations ?? []) {
    if (
      !assetIds.has(annotation.asset_id) ||
      !versions.some(
        (version) =>
          version.id === annotation.version_id &&
          version.asset_id === annotation.asset_id,
      )
    ) {
      throw new Error(
        `Backup visual annotation "${annotation.id}" has an invalid asset version reference.`,
      );
    }
  }
  for (const derived of data.visual_derived ?? []) {
    if (
      !assetIds.has(derived.asset_id) ||
      !versions.some(
        (version) =>
          version.id === derived.version_id &&
          version.asset_id === derived.asset_id,
      )
    ) {
      throw new Error(
        `Backup visual derived record "${derived.id}" has an invalid asset version reference.`,
      );
    }
  }
  for (const draft of data.visual_flow_drafts ?? []) {
    if (
      !assetIds.has(draft.source_asset_id) ||
      !versions.some(
        (version) =>
          version.id === draft.source_version_id &&
          version.asset_id === draft.source_asset_id,
      )
    ) {
      throw new Error(
        `Backup visual flow draft "${draft.id}" has an invalid source version reference.`,
      );
    }
  }
  const state: VisualStoreState = {
    assets,
    versions: hydratedVersions,
    annotations: data.visual_annotations ?? [],
    derived: data.visual_derived ?? [],
    relations: data.visual_relations ?? [],
    drafts: data.visual_flow_drafts ?? [],
  };
  await store.importState(state);
}
