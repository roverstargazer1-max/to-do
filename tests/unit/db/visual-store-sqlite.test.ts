import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createHash } from "node:crypto";
import { closeDatabase } from "@/lib/db/index";
import { VisualRepository } from "@/lib/db/repositories/visual-repository";
import { WorkspaceRepository } from "@/lib/db/repositories/workspace-repository";
import { VisualWorkspaceService } from "@/lib/visual/service";
import { localVisualAssetStore } from "@/lib/visual/local-store";
import type {
  VisualAnnotation,
  VisualAsset,
  VisualAssetVersion,
  VisualDerivedInfo,
  VisualFlowDraft,
  VisualRelation,
} from "@/lib/types/visual";
import type { VisualAssetRecordInput } from "@/lib/visual/store";

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
const JPEG_BYTES = new Uint8Array([255, 216, 255, 9, 9, 9]);
/** A real 1x1 PNG: the Visual Workspace Service validates image contents. */
const REAL_PNG = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);

function sha256Of(bytes: Uint8Array): string {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

function assetRecord(
  bytes: Uint8Array,
  overrides: Partial<VisualAsset> = {},
): VisualAssetRecordInput {
  const sha256 = sha256Of(bytes);
  const now = new Date().toISOString();
  const assetId = overrides.id ?? `asset-${sha256.slice(0, 8)}`;
  const versionId = `version-${assetId}`;

  const version: VisualAssetVersion = {
    id: versionId,
    asset_id: assetId,
    user_id: "local_user",
    version_number: 1,
    mime_type: "image/png",
    byte_size: bytes.length,
    width: 32,
    height: 24,
    sha256,
    storage_key: `local_user/${assetId}/${versionId}`,
    source: "paste",
    source_uri: null,
    source_asset_id: null,
    replaced_version_id: null,
    created_by: "local_user",
    created_at: now,
  };

  const asset: VisualAsset = {
    id: assetId,
    user_id: "local_user",
    workspace_id: "ws-1",
    current_version_id: versionId,
    mime_type: "image/png",
    byte_size: bytes.length,
    width: 32,
    height: 24,
    sha256,
    source: "paste",
    source_uri: null,
    title: "Diagram",
    alt_text: "A diagram",
    status: "active",
    version_count: 1,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    metadata: { origin: "clipboard" },
    ...overrides,
  };

  return { asset, version, bytes };
}

describe("Visual asset store on real SQLite", () => {
  let tempDir: string;
  let testDbPath: string;
  let assetsDir: string;
  let originalDbEnv: string | undefined;
  let originalAssetsEnv: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kagelin-visual-"));
    testDbPath = path.join(tempDir, "data.db");
    assetsDir = path.join(tempDir, "assets");
    originalDbEnv = process.env.KAGELIN_DB_PATH;
    originalAssetsEnv = process.env.KAGELIN_ASSETS_PATH;
    process.env.KAGELIN_DB_PATH = testDbPath;
    process.env.KAGELIN_ASSETS_PATH = assetsDir;
  });

  afterEach(() => {
    closeDatabase();
    if (originalDbEnv) process.env.KAGELIN_DB_PATH = originalDbEnv;
    else delete process.env.KAGELIN_DB_PATH;
    if (originalAssetsEnv) process.env.KAGELIN_ASSETS_PATH = originalAssetsEnv;
    else delete process.env.KAGELIN_ASSETS_PATH;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("writes pasted image bytes to the assets folder and metadata to SQLite", () => {
    const repo = new VisualRepository();
    const record = assetRecord(PNG_BYTES);

    const saved = repo.createAsset(record);

    expect(saved.sha256).toBe(sha256Of(PNG_BYTES));
    expect(saved.workspace_id).toBe("ws-1");
    expect(saved.version_count).toBe(1);

    const files = fs.readdirSync(assetsDir);
    expect(files).toEqual([`${saved.sha256}.png`]);

    const bytes = repo.readVersionBytes(saved.id);
    expect(Array.from(bytes)).toEqual(Array.from(PNG_BYTES));

    const version = repo.getVersion(saved.id);
    expect(version?.id).toBe(saved.current_version_id);
    expect(version?.sha256).toBe(saved.sha256);
  });

  it("appends immutable versions and keeps both readable from disk", () => {
    const repo = new VisualRepository();
    const created = repo.createAsset(assetRecord(PNG_BYTES));

    const secondVersion: VisualAssetVersion = {
      ...repo.getVersion(created.id)!,
      id: "version-2",
      version_number: 2,
      mime_type: "image/jpeg",
      byte_size: JPEG_BYTES.length,
      width: 64,
      height: 48,
      sha256: sha256Of(JPEG_BYTES),
      source: "upload",
      created_at: new Date().toISOString(),
    };

    const updated = repo.appendVersion({
      asset: {
        ...created,
        current_version_id: secondVersion.id,
        mime_type: "image/jpeg",
        byte_size: JPEG_BYTES.length,
        width: 64,
        height: 48,
        sha256: secondVersion.sha256,
        version_count: 2,
        source: "upload",
        updated_at: new Date().toISOString(),
      },
      version: secondVersion,
      bytes: JPEG_BYTES,
    });

    expect(updated.version_count).toBe(2);
    expect(updated.current_version_id).toBe("version-2");
    expect(updated.sha256).toBe(sha256Of(JPEG_BYTES));

    expect(Array.from(repo.readVersionBytes(created.id))).toEqual(
      Array.from(JPEG_BYTES),
    );
    expect(
      Array.from(repo.readVersionBytes(created.id, created.current_version_id)),
    ).toEqual(Array.from(PNG_BYTES));

    expect(fs.readdirSync(assetsDir).sort()).toEqual(
      [`${sha256Of(JPEG_BYTES)}.jpg`, `${sha256Of(PNG_BYTES)}.png`].sort(),
    );
  });

  it("reuses one file on disk when identical bytes live in two workspaces", () => {
    const repo = new VisualRepository();
    repo.createAsset(
      assetRecord(PNG_BYTES, { id: "asset-a", workspace_id: "ws-1" }),
    );
    repo.createAsset(
      assetRecord(PNG_BYTES, { id: "asset-b", workspace_id: "ws-2" }),
    );

    expect(fs.readdirSync(assetsDir)).toEqual([`${sha256Of(PNG_BYTES)}.png`]);
    expect(repo.listAssets("ws-1").map((a) => a.id)).toEqual(["asset-a"]);
    expect(repo.listAssets("ws-2").map((a) => a.id)).toEqual(["asset-b"]);
  });

  it("cascades asset deletion to versions, annotations, derived rows, and relations", () => {
    const repo = new VisualRepository();
    const created = repo.createAsset(assetRecord(PNG_BYTES));

    const now = new Date().toISOString();
    const annotation: VisualAnnotation = {
      id: "annotation-1",
      workspace_id: "ws-1",
      asset_id: created.id,
      version_id: created.current_version_id,
      type: "box",
      geometry: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      text: "callout",
      confidence: 0.9,
      source: "user",
      created_by: "local_user",
      created_at: now,
      updated_at: now,
    };
    repo.putAnnotation(annotation);

    const derived: VisualDerivedInfo = {
      id: "derived-1",
      asset_id: created.id,
      version_id: created.current_version_id,
      kind: "ocr",
      value: "hello",
      confidence: 0.8,
      source: "ai",
      status: "ready",
      created_at: now,
      updated_at: now,
    };
    repo.putDerived(derived);

    const relation: VisualRelation = {
      id: "relation-1",
      workspace_id: "ws-1",
      user_id: "local_user",
      relation_type: "reference",
      source_type: "visual_asset",
      source_id: created.id,
      target_type: "workspace_node",
      target_id: "node-1",
      source_version_id: created.current_version_id,
      target_version_id: null,
      description: null,
      created_by: "local_user",
      created_at: now,
      updated_at: now,
    };
    repo.putRelation(relation);

    repo.removeAsset(created.id);

    expect(repo.getAsset(created.id, true)).toBeNull();
    expect(repo.listVersions(created.id)).toEqual([]);
    expect(repo.listAnnotations(created.id)).toEqual([]);
    expect(repo.listDerived(created.id)).toEqual([]);
    expect(repo.listRelations("ws-1")).toEqual([]);
  });

  it("round-trips annotations, derived info, relations, and flow drafts", () => {
    const repo = new VisualRepository();
    const created = repo.createAsset(assetRecord(PNG_BYTES));
    const now = new Date().toISOString();

    repo.putAnnotation({
      id: "annotation-1",
      workspace_id: "ws-1",
      asset_id: created.id,
      version_id: created.current_version_id,
      type: "text",
      geometry: { x: 0.5, y: 0.5 },
      text: "note",
      confidence: null,
      source: "user",
      created_by: "local_user",
      created_at: now,
      updated_at: now,
    });

    repo.putDerived({
      id: "derived-1",
      asset_id: created.id,
      version_id: created.current_version_id,
      kind: "tags",
      value: ["diagram", "flow"],
      confidence: 0.7,
      source: "system",
      status: "ready",
      created_at: now,
      updated_at: now,
    });

    repo.putRelation({
      id: "relation-1",
      workspace_id: "ws-1",
      user_id: "local_user",
      relation_type: "derived-from",
      source_type: "visual_asset",
      source_id: created.id,
      target_type: "step",
      target_id: "step-1",
      source_version_id: created.current_version_id,
      target_version_id: null,
      description: "flow origin",
      created_by: "local_user",
      created_at: now,
      updated_at: now,
    });

    const draft: VisualFlowDraft = {
      id: "draft-1",
      workspace_id: "ws-1",
      source_asset_id: created.id,
      source_node_id: "node-1",
      source_version_id: created.current_version_id,
      status: "pending",
      nodes: [
        {
          id: "draft-node-1",
          kind: "step",
          title: "Draft step",
          position: { x: 10, y: 20 },
        },
      ],
      edges: [
        {
          id: "draft-edge-1",
          fromNodeId: "draft-node-1",
          toNodeId: "draft-node-1",
          label: "loop",
        },
      ],
      confidence: 0.5,
      uncertainties: ["unclear arrow"],
      provenance: { model: "test" },
      created_by: "local_user",
      request_id: "req-1",
      created_at: now,
      updated_at: now,
      confirmed_at: null,
    };
    repo.putDraft(draft);

    expect(repo.listAnnotations(created.id)).toHaveLength(1);
    expect(repo.listAnnotations(created.id)[0].geometry).toEqual({
      x: 0.5,
      y: 0.5,
    });
    expect(repo.listDerived(created.id)[0].value).toEqual(["diagram", "flow"]);
    expect(repo.listRelations("ws-1")).toHaveLength(1);
    expect(repo.listRelations("ws-1")[0].description).toBe("flow origin");
    expect(repo.getDraft("draft-1")).toEqual(draft);
    expect(repo.listDrafts("ws-1")).toHaveLength(1);
  });

  it("creates the visual tables through the embedded migrator", () => {
    const repo = new VisualRepository();
    const created = repo.createAsset(assetRecord(PNG_BYTES));
    const workspaceRepo = new WorkspaceRepository();

    // A second connection opening the same file sees the migrated schema.
    const secondConnection = new VisualRepository();
    expect(secondConnection.getAsset(created.id)?.id).toBe(created.id);
    expect(workspaceRepo.listWorkspaces()).toEqual([]);
  });

  it("ingests a pasted canvas image through the Visual Workspace Service", async () => {
    const service = new VisualWorkspaceService(localVisualAssetStore, {
      userId: "local_user",
      getWorkspace: async (workspaceId) => ({
        id: workspaceId,
        user_id: "local_user",
        name: "Canvas",
        color: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      listNodes: async () => [],
    });

    const created = await service.ingest({
      workspaceId: "ws-paste",
      bytes: REAL_PNG,
      mimeType: "image/png",
      source: "paste",
      title: "Pasted diagram",
    });

    expect(created.reused).toBe(false);
    expect(fs.readdirSync(assetsDir)).toEqual([
      `${createHash("sha256").update(Buffer.from(REAL_PNG)).digest("hex")}.png`,
    ]);

    const rows = new VisualRepository().listAssets("ws-paste");
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Pasted diagram");
    expect(rows[0].source).toBe("paste");
    expect(rows[0].status).toBe("active");

    const bytes = await localVisualAssetStore.readVersion(
      created.asset.id,
      created.asset.current_version_id,
    );
    expect(Array.from(bytes)).toEqual(Array.from(REAL_PNG));

    // Identical bytes paste again: the service reuses the SQLite record.
    const again = await service.ingest({
      workspaceId: "ws-paste",
      bytes: REAL_PNG,
      mimeType: "image/png",
      source: "paste",
    });
    expect(again.reused).toBe(true);
    expect(new VisualRepository().listAssets("ws-paste")).toHaveLength(1);
  });

  it("soft-deletes and restores assets through the service without touching the row shape", async () => {
    const service = new VisualWorkspaceService(localVisualAssetStore, {
      userId: "local_user",
      getWorkspace: async (workspaceId) => ({
        id: workspaceId,
        user_id: "local_user",
        name: "Canvas",
        color: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      listNodes: async () => [],
    });

    const created = await service.ingest({
      workspaceId: "ws-delete",
      bytes: REAL_PNG,
      mimeType: "image/png",
      source: "upload",
    });

    await service.deleteAsset(created.asset.id, true);
    const repo = new VisualRepository();
    expect(repo.getAsset(created.asset.id)).toBeNull();
    expect(repo.getAsset(created.asset.id, true)?.status).toBe("deleted");

    await service.restoreAsset(created.asset.id);
    expect(repo.getAsset(created.asset.id)?.status).toBe("active");
  });
});
