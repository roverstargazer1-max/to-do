import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NextRequest } from "next/server";
import { closeDatabase } from "@/lib/db/index";
import {
  GET as getAssets,
  POST as postAssets,
  PATCH as patchAssets,
  DELETE as deleteAssets,
} from "@/../app/api/db/visual-assets/route";
import { GET as getVersions } from "@/../app/api/db/visual-asset-versions/route";
import {
  GET as getAnnotations,
  POST as postAnnotations,
} from "@/../app/api/db/visual-annotations/route";
import { POST as postRelations } from "@/../app/api/db/visual-relations/route";
import { GET as getAssetBytes } from "@/../app/api/assets/[hash]/route";
import type { VisualAsset, VisualAssetVersion } from "@/lib/types/visual";
import { createHash } from "node:crypto";

const REAL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function jsonRequest(url: string, method: string, body: unknown) {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
  });
}

describe("API routes: visual asset store", () => {
  let tempDir: string;
  let testDbPath: string;
  let assetsDir: string;
  let originalDbEnv: string | undefined;
  let originalAssetsEnv: string | undefined;

  const now = new Date().toISOString();
  const sha256 = createHash("sha256")
    .update(Buffer.from(REAL_PNG_BASE64, "base64"))
    .digest("hex");

  const asset: VisualAsset = {
    id: "asset-api-1",
    user_id: "local_user",
    workspace_id: "ws-api",
    current_version_id: "version-api-1",
    mime_type: "image/png",
    byte_size: Buffer.from(REAL_PNG_BASE64, "base64").length,
    width: 1,
    height: 1,
    sha256,
    source: "paste",
    source_uri: null,
    title: "Pasted",
    alt_text: null,
    status: "active",
    version_count: 1,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    metadata: null,
  };

  const version: VisualAssetVersion = {
    id: "version-api-1",
    asset_id: "asset-api-1",
    user_id: "local_user",
    version_number: 1,
    mime_type: "image/png",
    byte_size: asset.byte_size,
    width: 1,
    height: 1,
    sha256,
    storage_key: "local_user/asset-api-1/version-api-1",
    source: "paste",
    source_uri: null,
    source_asset_id: null,
    replaced_version_id: null,
    created_by: "local_user",
    created_at: now,
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kagelin-visual-api-"));
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

  it("stores pasted bytes on disk and streams them back over the asset route", async () => {
    const createRes = await postAssets(
      jsonRequest("http://localhost:3000/api/db/visual-assets", "POST", {
        asset,
        version,
        bytesBase64: REAL_PNG_BASE64,
      }),
    );
    expect(createRes.status).toBe(201);

    expect(fs.readdirSync(assetsDir)).toEqual([`${sha256}.png`]);

    const listRes = await getAssets(
      new NextRequest(
        "http://localhost:3000/api/db/visual-assets?workspaceId=ws-api",
      ),
    );
    expect(listRes.status).toBe(200);
    const listed = await listRes.json();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe("asset-api-1");

    const versionRes = await getVersions(
      new NextRequest(
        "http://localhost:3000/api/db/visual-asset-versions?assetId=asset-api-1",
      ),
    );
    expect((await versionRes.json()).id).toBe("version-api-1");

    const listVersionsRes = await getVersions(
      new NextRequest(
        "http://localhost:3000/api/db/visual-asset-versions?assetId=asset-api-1&list=true",
      ),
    );
    expect(await listVersionsRes.json()).toHaveLength(1);

    // The streaming route serves immutable version bytes by hash.
    const streamRes = await getAssetBytes(
      new NextRequest(`http://localhost:3000/api/assets/${sha256}`),
      { params: Promise.resolve({ hash: sha256 }) },
    );
    expect(streamRes.status).toBe(200);
    expect(Buffer.from(await streamRes.arrayBuffer()).toString("base64")).toBe(
      REAL_PNG_BASE64,
    );
  });

  it("updates metadata, and deletes the asset with its dependent rows", async () => {
    await postAssets(
      jsonRequest("http://localhost:3000/api/db/visual-assets", "POST", {
        asset,
        version,
        bytesBase64: REAL_PNG_BASE64,
      }),
    );

    const patchRes = await patchAssets(
      jsonRequest("http://localhost:3000/api/db/visual-assets", "PATCH", {
        asset: { ...asset, title: "Renamed", status: "pending_deletion" },
      }),
    );
    expect(patchRes.status).toBe(200);
    expect((await patchRes.json()).title).toBe("Renamed");

    await postAnnotations(
      jsonRequest("http://localhost:3000/api/db/visual-annotations", "POST", {
        annotation: {
          id: "annotation-api-1",
          workspace_id: "ws-api",
          asset_id: asset.id,
          version_id: version.id,
          type: "box",
          geometry: { x: 0, y: 0, width: 1, height: 1 },
          text: null,
          confidence: null,
          source: "user",
          created_by: "local_user",
          created_at: now,
          updated_at: now,
        },
      }),
    );
    expect(
      await (
        await getAnnotations(
          new NextRequest(
            "http://localhost:3000/api/db/visual-annotations?assetId=asset-api-1",
          ),
        )
      ).json(),
    ).toHaveLength(1);

    await postRelations(
      jsonRequest("http://localhost:3000/api/db/visual-relations", "POST", {
        relation: {
          id: "relation-api-1",
          workspace_id: "ws-api",
          user_id: "local_user",
          relation_type: "reference",
          source_type: "visual_asset",
          source_id: asset.id,
          target_type: "workspace_node",
          target_id: "node-1",
          source_version_id: version.id,
          target_version_id: null,
          description: null,
          created_by: "local_user",
          created_at: now,
          updated_at: now,
        },
      }),
    );

    const deleteRes = await deleteAssets(
      new NextRequest(
        "http://localhost:3000/api/db/visual-assets?id=asset-api-1",
        {
          method: "DELETE",
        },
      ),
    );
    expect(deleteRes.status).toBe(200);

    const afterDelete = await getAssets(
      new NextRequest(
        "http://localhost:3000/api/db/visual-assets?workspaceId=ws-api",
      ),
    );
    expect(await afterDelete.json()).toEqual([]);

    const relationsAfter = await (
      await import("@/../app/api/db/visual-relations/route")
    ).GET(
      new NextRequest("http://localhost:3000/api/db/visual-relations?all=true"),
    );
    expect(await relationsAfter.json()).toEqual([]);

    // Image bytes stay on disk: they may be referenced by another asset row.
    expect(fs.readdirSync(assetsDir)).toEqual([`${sha256}.png`]);
  });
});
