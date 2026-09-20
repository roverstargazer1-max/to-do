import type {
  VisualAnnotation,
  VisualAsset,
  VisualAssetVersion,
  VisualDerivedInfo,
  VisualFlowDraft,
  VisualRelation,
} from "@/lib/types/visual";
import { getLocalDal } from "@/lib/api/local-dal";

function getBaseUrl(): string {
  if (typeof window !== "undefined") return "";
  return process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const visualClient = {
  async listAssets(
    workspaceId?: string,
    includeDeleted = false,
  ): Promise<VisualAsset[]> {
    const dal = getLocalDal();
    if (dal) return dal.visual.listAssets(workspaceId, includeDeleted);
    const params = new URLSearchParams();
    if (workspaceId) params.set("workspaceId", workspaceId);
    if (includeDeleted) params.set("includeDeleted", "true");
    const res = await fetch(`${getBaseUrl()}/api/db/visual-assets?${params}`);
    if (!res.ok)
      throw new Error(`Failed to list visual assets: ${res.statusText}`);
    return res.json();
  },

  async getAsset(
    assetId: string,
    includeDeleted = false,
  ): Promise<VisualAsset | null> {
    const dal = getLocalDal();
    if (dal) return dal.visual.getAsset(assetId, includeDeleted);
    const params = new URLSearchParams({ id: assetId });
    if (includeDeleted) params.set("includeDeleted", "true");
    const res = await fetch(`${getBaseUrl()}/api/db/visual-assets?${params}`);
    if (res.status === 404) return null;
    if (!res.ok)
      throw new Error(`Failed to read visual asset: ${res.statusText}`);
    return res.json();
  },

  async getVersion(
    assetId: string,
    versionId?: string,
  ): Promise<VisualAssetVersion | null> {
    const dal = getLocalDal();
    if (dal) return dal.visual.getVersion(assetId, versionId);
    const params = new URLSearchParams({ assetId });
    if (versionId) params.set("versionId", versionId);
    const res = await fetch(
      `${getBaseUrl()}/api/db/visual-asset-versions?${params}`,
    );
    if (res.status === 404) return null;
    if (!res.ok)
      throw new Error(`Failed to read visual version: ${res.statusText}`);
    return res.json();
  },

  async readVersionBytes(
    assetId: string,
    versionId?: string,
  ): Promise<Uint8Array> {
    const dal = getLocalDal();
    if (dal) return dal.visual.readVersionBytes(assetId, versionId);
    const version = await this.getVersion(assetId, versionId);
    if (!version) {
      throw new Error(`Visual asset version for "${assetId}" was not found.`);
    }
    const res = await fetch(`${getBaseUrl()}/api/assets/${version.sha256}`);
    if (!res.ok)
      throw new Error(`Failed to read visual bytes: ${res.statusText}`);
    return new Uint8Array(await res.arrayBuffer());
  },

  async listVersions(assetId: string): Promise<VisualAssetVersion[]> {
    const dal = getLocalDal();
    if (dal) return dal.visual.listVersions(assetId);
    const params = new URLSearchParams({ assetId, list: "true" });
    const res = await fetch(
      `${getBaseUrl()}/api/db/visual-asset-versions?${params}`,
    );
    if (!res.ok)
      throw new Error(`Failed to list visual versions: ${res.statusText}`);
    return res.json();
  },

  async createAsset(input: {
    asset: VisualAsset;
    version: VisualAssetVersion;
    bytes: Uint8Array;
  }): Promise<VisualAsset> {
    const dal = getLocalDal();
    if (dal) return dal.visual.createAsset(input);
    const res = await postJson(`${getBaseUrl()}/api/db/visual-assets`, {
      asset: input.asset,
      version: input.version,
      bytesBase64: toBase64(input.bytes),
    });
    if (!res.ok)
      throw new Error(`Failed to create visual asset: ${res.statusText}`);
    return res.json();
  },

  async appendVersion(input: {
    asset: VisualAsset;
    version: VisualAssetVersion;
    bytes: Uint8Array;
  }): Promise<VisualAsset> {
    const dal = getLocalDal();
    if (dal) return dal.visual.appendVersion(input);
    const res = await postJson(`${getBaseUrl()}/api/db/visual-assets`, {
      action: "appendVersion",
      asset: input.asset,
      version: input.version,
      bytesBase64: toBase64(input.bytes),
    });
    if (!res.ok)
      throw new Error(`Failed to append visual version: ${res.statusText}`);
    return res.json();
  },

  async updateAsset(asset: VisualAsset): Promise<VisualAsset> {
    const dal = getLocalDal();
    if (dal) return dal.visual.updateAsset(asset);
    const res = await fetch(`${getBaseUrl()}/api/db/visual-assets`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset }),
    });
    if (!res.ok)
      throw new Error(`Failed to update visual asset: ${res.statusText}`);
    return res.json();
  },

  async removeAsset(assetId: string): Promise<void> {
    const dal = getLocalDal();
    if (dal) {
      dal.visual.removeAsset(assetId);
      return;
    }
    const res = await fetch(
      `${getBaseUrl()}/api/db/visual-assets?id=${encodeURIComponent(assetId)}`,
      { method: "DELETE" },
    );
    if (!res.ok)
      throw new Error(`Failed to delete visual asset: ${res.statusText}`);
  },

  async listAnnotations(
    assetId: string,
    versionId?: string,
  ): Promise<VisualAnnotation[]> {
    const dal = getLocalDal();
    if (dal) return dal.visual.listAnnotations(assetId, versionId);
    const params = new URLSearchParams({ assetId });
    if (versionId) params.set("versionId", versionId);
    const res = await fetch(
      `${getBaseUrl()}/api/db/visual-annotations?${params}`,
    );
    if (!res.ok)
      throw new Error(`Failed to list annotations: ${res.statusText}`);
    return res.json();
  },

  async putAnnotation(annotation: VisualAnnotation): Promise<VisualAnnotation> {
    const dal = getLocalDal();
    if (dal) return dal.visual.putAnnotation(annotation);
    const res = await postJson(`${getBaseUrl()}/api/db/visual-annotations`, {
      annotation,
    });
    if (!res.ok)
      throw new Error(`Failed to save annotation: ${res.statusText}`);
    return res.json();
  },

  async removeAnnotation(annotationId: string): Promise<void> {
    const dal = getLocalDal();
    if (dal) {
      dal.visual.removeAnnotation(annotationId);
      return;
    }
    const res = await fetch(
      `${getBaseUrl()}/api/db/visual-annotations?id=${encodeURIComponent(annotationId)}`,
      { method: "DELETE" },
    );
    if (!res.ok)
      throw new Error(`Failed to delete annotation: ${res.statusText}`);
  },

  async listDerived(
    assetId: string,
    versionId?: string,
  ): Promise<VisualDerivedInfo[]> {
    const dal = getLocalDal();
    if (dal) return dal.visual.listDerived(assetId, versionId);
    const params = new URLSearchParams({ assetId });
    if (versionId) params.set("versionId", versionId);
    const res = await fetch(`${getBaseUrl()}/api/db/visual-derived?${params}`);
    if (!res.ok)
      throw new Error(`Failed to list derived info: ${res.statusText}`);
    return res.json();
  },

  async putDerived(derived: VisualDerivedInfo): Promise<VisualDerivedInfo> {
    const dal = getLocalDal();
    if (dal) return dal.visual.putDerived(derived);
    const res = await postJson(`${getBaseUrl()}/api/db/visual-derived`, {
      derived,
    });
    if (!res.ok)
      throw new Error(`Failed to save derived info: ${res.statusText}`);
    return res.json();
  },

  async listRelations(
    workspaceId: string,
    all = false,
  ): Promise<VisualRelation[]> {
    const dal = getLocalDal();
    if (dal)
      return all
        ? dal.visual.listAllRelations()
        : dal.visual.listRelations(workspaceId);
    const params = new URLSearchParams(all ? { all: "true" } : { workspaceId });
    const res = await fetch(
      `${getBaseUrl()}/api/db/visual-relations?${params}`,
    );
    if (!res.ok) throw new Error(`Failed to list relations: ${res.statusText}`);
    return res.json();
  },

  async putRelation(relation: VisualRelation): Promise<VisualRelation> {
    const dal = getLocalDal();
    if (dal) return dal.visual.putRelation(relation);
    const res = await postJson(`${getBaseUrl()}/api/db/visual-relations`, {
      relation,
    });
    if (!res.ok) throw new Error(`Failed to save relation: ${res.statusText}`);
    return res.json();
  },

  async removeRelation(relationId: string): Promise<void> {
    const dal = getLocalDal();
    if (dal) {
      dal.visual.removeRelation(relationId);
      return;
    }
    const res = await fetch(
      `${getBaseUrl()}/api/db/visual-relations?id=${encodeURIComponent(relationId)}`,
      { method: "DELETE" },
    );
    if (!res.ok)
      throw new Error(`Failed to delete relation: ${res.statusText}`);
  },

  async listDrafts(
    workspaceId: string,
    all = false,
  ): Promise<VisualFlowDraft[]> {
    const dal = getLocalDal();
    if (dal)
      return all
        ? dal.visual.listAllDrafts()
        : dal.visual.listDrafts(workspaceId);
    const params = new URLSearchParams(all ? { all: "true" } : { workspaceId });
    const res = await fetch(`${getBaseUrl()}/api/db/visual-drafts?${params}`);
    if (!res.ok)
      throw new Error(`Failed to list flow drafts: ${res.statusText}`);
    return res.json();
  },

  async getDraft(draftId: string): Promise<VisualFlowDraft | null> {
    const dal = getLocalDal();
    if (dal) return dal.visual.getDraft(draftId);
    const res = await fetch(
      `${getBaseUrl()}/api/db/visual-drafts?id=${encodeURIComponent(draftId)}`,
    );
    if (res.status === 404) return null;
    if (!res.ok)
      throw new Error(`Failed to read flow draft: ${res.statusText}`);
    return res.json();
  },

  async putDraft(draft: VisualFlowDraft): Promise<VisualFlowDraft> {
    const dal = getLocalDal();
    if (dal) return dal.visual.putDraft(draft);
    const res = await postJson(`${getBaseUrl()}/api/db/visual-drafts`, {
      draft,
    });
    if (!res.ok)
      throw new Error(`Failed to save flow draft: ${res.statusText}`);
    return res.json();
  },

  async clearAll(): Promise<void> {
    const dal = getLocalDal();
    if (dal) {
      dal.visual.clearAll();
      return;
    }
    const res = await postJson(`${getBaseUrl()}/api/db/visual-assets`, {
      action: "clear",
    });
    if (!res.ok)
      throw new Error(`Failed to clear visual store: ${res.statusText}`);
  },
};
