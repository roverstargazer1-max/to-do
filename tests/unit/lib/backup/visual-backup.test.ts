import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { BackupData } from "@/lib/backup/types";
import { createBackupZip, parseBackupZip } from "@/lib/backup/export-import";
import {
  collectVisualBackupData,
  restoreVisualBackupData,
} from "@/lib/backup/visual-data";
import { calculateVisualSha256 } from "@/lib/visual/validation";
import { InMemoryVisualAssetStore } from "@/lib/visual/store";

const PNG = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);

function baseBackup(overrides: Partial<BackupData> = {}): BackupData {
  return {
    metadata: {
      version: 1,
      appVersion: "1.42.0",
      exportedAt: "2026-09-16T00:00:00.000Z",
    },
    tasks: [],
    projects: [],
    habits: [],
    habit_entries: [],
    focus_logs: [],
    events: [],
    ...overrides,
  } as BackupData;
}

async function visualBackupData() {
  const store = new InMemoryVisualAssetStore();
  const sha256 = await calculateVisualSha256(PNG);
  await store.createAsset({
    asset: {
      id: "asset-1",
      user_id: "guest",
      workspace_id: "ws-1",
      current_version_id: "version-1",
      mime_type: "image/png",
      byte_size: PNG.length,
      width: 1,
      height: 1,
      sha256,
      source: "upload",
      status: "active",
      version_count: 1,
      created_at: "2026-09-16T00:00:00.000Z",
      updated_at: "2026-09-16T00:00:00.000Z",
    },
    version: {
      id: "version-1",
      asset_id: "asset-1",
      user_id: "guest",
      version_number: 1,
      mime_type: "image/png",
      byte_size: PNG.length,
      width: 1,
      height: 1,
      sha256,
      storage_key: "guest/asset-1/version-1",
      source: "upload",
      created_at: "2026-09-16T00:00:00.000Z",
      data: PNG,
    },
    bytes: PNG,
  });
  return { store, data: await collectVisualBackupData(store) };
}

describe("visual asset Backup", () => {
  it("round-trips metadata, manifest, and immutable version bytes", async () => {
    const { store, data } = await visualBackupData();
    const parsed = await parseBackupZip(
      await createBackupZip(baseBackup(data)),
    );
    expect(parsed.metadata.version).toBe(2);
    expect(parsed.visual_assets?.[0].id).toBe("asset-1");
    expect(parsed.visual_asset_manifest?.[0]).toEqual(
      expect.objectContaining({ versionId: "version-1", byteSize: PNG.length }),
    );
    const restored = new InMemoryVisualAssetStore();
    await restoreVisualBackupData(parsed, restored);
    expect(await restored.readVersion("asset-1", "version-1")).toEqual(PNG);
    expect((await restored.exportState()).assets).toEqual(
      (await store.exportState()).assets,
    );
  });

  it("fails closed when an asset file is missing or has a bad hash", async () => {
    const { data } = await visualBackupData();
    await expect(
      createBackupZip(
        baseBackup({
          ...data,
          visual_asset_files: {},
        }),
      ),
    ).rejects.toThrow(/missing/i);

    const originalFiles = unzipSync(
      new Uint8Array(
        await (await createBackupZip(baseBackup(data))).arrayBuffer(),
      ),
    );
    const json = JSON.parse(strFromU8(originalFiles["backup.json"]));
    const path = json.visual_asset_manifest[0].path as string;
    originalFiles[path] = Uint8Array.from(
      originalFiles[path],
      (value) => value ^ 0xff,
    );
    const corrupted = new Blob([
      zipSync(originalFiles as Record<string, Uint8Array>) as BlobPart,
    ]);
    await expect(parseBackupZip(corrupted)).rejects.toThrow(/integrity/i);
  });

  it("rejects dangling current-version and annotation references before import", async () => {
    const { data } = await visualBackupData();
    const badCurrentVersion = {
      ...data,
      visual_assets: data.visual_assets!.map((asset) => ({
        ...asset,
        current_version_id: "missing-version",
      })),
    };
    await expect(
      restoreVisualBackupData(
        badCurrentVersion,
        new InMemoryVisualAssetStore(),
      ),
    ).rejects.toThrow(/current version/i);

    const annotation: NonNullable<BackupData["visual_annotations"]>[number] = {
      id: "annotation-1",
      workspace_id: "ws-1",
      asset_id: "asset-1",
      version_id: "missing-version",
      type: "box",
      geometry: { x: 0, y: 0, width: 1, height: 1 },
      text: null,
      confidence: null,
      source: "import",
      created_by: "guest",
      created_at: "2026-09-16T00:00:00.000Z",
      updated_at: "2026-09-16T00:00:00.000Z",
    };
    await expect(
      restoreVisualBackupData(
        { ...data, visual_annotations: [annotation] },
        new InMemoryVisualAssetStore(),
      ),
    ).rejects.toThrow(/annotation/i);
  });

  it("preserves old backups without visual sections", async () => {
    const parsed = await parseBackupZip(await createBackupZip(baseBackup()));
    expect(parsed.metadata.version).toBe(1);
    expect(parsed.visual_assets).toBeUndefined();
  });
});
