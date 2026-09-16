/**
 * Guest visual storage. Binary data has its own IndexedDB key so a node drag
 * never serializes the image collection and a workspace restore can preserve
 * the asset/node boundary.
 */
import { del, get, set } from "idb-keyval";
import type {
  VisualAnnotation,
  VisualAsset,
  VisualAssetVersion,
  VisualDerivedInfo,
  VisualFlowDraft,
  VisualRelation,
} from "@/lib/types/visual";
import {
  InMemoryVisualAssetStore,
  type VisualAssetRecordInput,
  type VisualAssetStore,
  type VisualStoreState,
  type VisualVersionRecordInput,
} from "@/lib/visual/store";

export const GUEST_VISUAL_ASSETS_KEY = "kanso-guest-visual-assets";

function cloneBytes(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value.slice();
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  return undefined;
}

async function normaliseState(
  value: Partial<VisualStoreState> | undefined,
): Promise<VisualStoreState> {
  const versions = await Promise.all(
    (value?.versions ?? []).map(async (version) => {
      let data = cloneBytes(version.data);
      if (
        !data &&
        typeof Blob !== "undefined" &&
        version.data instanceof Blob
      ) {
        data = new Uint8Array(await version.data.arrayBuffer());
      }
      return { ...version, ...(data ? { data } : {}) };
    }),
  );
  return {
    assets: value?.assets ?? [],
    versions,
    annotations: value?.annotations ?? [],
    derived: value?.derived ?? [],
    relations: value?.relations ?? [],
    drafts: value?.drafts ?? [],
  };
}

let storeCache: InMemoryVisualAssetStore | null = null;
let loadPromise: Promise<InMemoryVisualAssetStore> | null = null;

async function loadStore(): Promise<InMemoryVisualAssetStore> {
  if (storeCache) return storeCache;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    let stored: Partial<VisualStoreState> | undefined;
    try {
      stored = await get<Partial<VisualStoreState>>(GUEST_VISUAL_ASSETS_KEY);
    } catch (error) {
      // SSR/jsdom has no IndexedDB. Keep the adapter usable in memory while
      // real browser sessions still fail loudly on a write if storage breaks.
      if (typeof indexedDB !== "undefined") throw error;
    }
    const store = new InMemoryVisualAssetStore(await normaliseState(stored));
    storeCache = store;
    loadPromise = null;
    return store;
  })();
  return loadPromise;
}

async function persistStore(store: InMemoryVisualAssetStore): Promise<void> {
  try {
    await set(GUEST_VISUAL_ASSETS_KEY, await store.exportState());
  } catch (error) {
    if (typeof indexedDB !== "undefined") throw error;
  }
}

/** IndexedDB-backed implementation of the common Visual asset adapter. */
export class GuestVisualAssetStore implements VisualAssetStore {
  async clear(): Promise<void> {
    await this.clearAll();
  }

  async listAssets(workspaceId?: string): Promise<VisualAsset[]> {
    return (await loadStore()).listAssets(workspaceId);
  }

  async listAllAssets(): Promise<VisualAsset[]> {
    return (await loadStore()).listAssets();
  }

  async getAsset(assetId: string): Promise<VisualAsset | null> {
    return (await loadStore()).getAsset(assetId);
  }

  async getAssetIncludingDeleted(assetId: string): Promise<VisualAsset | null> {
    return (await loadStore()).getAssetIncludingDeleted(assetId);
  }

  async getVersion(
    assetId: string,
    versionId?: string,
  ): Promise<VisualAssetVersion | null> {
    return (await loadStore()).getVersion(assetId, versionId);
  }

  async readVersion(assetId: string, versionId?: string): Promise<Uint8Array> {
    return (await loadStore()).readVersion(assetId, versionId);
  }

  async createAsset(input: VisualAssetRecordInput): Promise<VisualAsset> {
    const store = await loadStore();
    const result = await store.createAsset(input);
    await persistStore(store);
    return result;
  }

  async appendVersion(input: VisualVersionRecordInput): Promise<VisualAsset> {
    const store = await loadStore();
    const result = await store.appendVersion(input);
    await persistStore(store);
    return result;
  }

  async updateAsset(asset: VisualAsset): Promise<VisualAsset> {
    const store = await loadStore();
    const result = await store.updateAsset(asset);
    await persistStore(store);
    return result;
  }

  async removeAsset(assetId: string): Promise<void> {
    const store = await loadStore();
    await store.removeAsset(assetId);
    await persistStore(store);
  }

  async listAnnotations(
    assetId: string,
    versionId?: string,
  ): Promise<VisualAnnotation[]> {
    return (await loadStore()).listAnnotations(assetId, versionId);
  }

  async putAnnotation(annotation: VisualAnnotation): Promise<VisualAnnotation> {
    const store = await loadStore();
    const result = await store.putAnnotation(annotation);
    await persistStore(store);
    return result;
  }

  async removeAnnotation(annotationId: string): Promise<void> {
    const store = await loadStore();
    await store.removeAnnotation(annotationId);
    await persistStore(store);
  }

  async listDerived(
    assetId: string,
    versionId?: string,
  ): Promise<VisualDerivedInfo[]> {
    return (await loadStore()).listDerived(assetId, versionId);
  }

  async putDerived(derived: VisualDerivedInfo): Promise<VisualDerivedInfo> {
    const store = await loadStore();
    const result = await store.putDerived(derived);
    await persistStore(store);
    return result;
  }

  async listRelations(workspaceId: string): Promise<VisualRelation[]> {
    return (await loadStore()).listRelations(workspaceId);
  }

  async putRelation(relation: VisualRelation): Promise<VisualRelation> {
    const store = await loadStore();
    const result = await store.putRelation(relation);
    await persistStore(store);
    return result;
  }

  async removeRelation(relationId: string): Promise<void> {
    const store = await loadStore();
    await store.removeRelation(relationId);
    await persistStore(store);
  }

  async listDrafts(workspaceId: string): Promise<VisualFlowDraft[]> {
    return (await loadStore()).listDrafts(workspaceId);
  }

  async getDraft(draftId: string): Promise<VisualFlowDraft | null> {
    return (await loadStore()).getDraft(draftId);
  }

  async putDraft(draft: VisualFlowDraft): Promise<VisualFlowDraft> {
    const store = await loadStore();
    const result = await store.putDraft(draft);
    await persistStore(store);
    return result;
  }

  async clearAll(): Promise<void> {
    storeCache = null;
    loadPromise = null;
    await del(GUEST_VISUAL_ASSETS_KEY);
  }

  async exportState(): Promise<VisualStoreState> {
    return (await loadStore()).exportState();
  }

  async importState(state: VisualStoreState): Promise<void> {
    const store = await loadStore();
    await store.importState(state);
    await persistStore(store);
  }

  /** Explicit restore alias used by Backup adapters. */
  async restoreBackup(state: VisualStoreState): Promise<void> {
    await this.importState(state);
  }
}

export const guestVisualAssetStore = new GuestVisualAssetStore();
