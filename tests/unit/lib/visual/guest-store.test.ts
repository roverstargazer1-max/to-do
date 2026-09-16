import { beforeEach, describe, expect, it, vi } from "vitest";

const backing = new Map<string, unknown>();

vi.mock("idb-keyval", () => ({
  get: vi.fn(async (key: string) => backing.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    backing.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    backing.delete(key);
  }),
}));

import {
  guestVisualAssetStore,
  GUEST_VISUAL_ASSETS_KEY,
} from "@/lib/visual/guest-store";
import { calculateVisualSha256 } from "@/lib/visual/validation";

const PNG = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);

describe("GuestVisualAssetStore", () => {
  beforeEach(async () => {
    backing.clear();
    await guestVisualAssetStore.clear();
  });

  it("persists visual bytes under an independent Guest IndexedDB key", async () => {
    const sha256 = await calculateVisualSha256(PNG);
    await guestVisualAssetStore.createAsset({
      asset: {
        id: "asset-guest",
        user_id: "guest",
        workspace_id: "ws-guest",
        current_version_id: "version-guest",
        mime_type: "image/png",
        byte_size: PNG.length,
        width: 1,
        height: 1,
        sha256,
        source: "paste",
        status: "active",
        version_count: 1,
        created_at: "2026-09-16T00:00:00.000Z",
        updated_at: "2026-09-16T00:00:00.000Z",
      },
      version: {
        id: "version-guest",
        asset_id: "asset-guest",
        user_id: "guest",
        version_number: 1,
        mime_type: "image/png",
        byte_size: PNG.length,
        width: 1,
        height: 1,
        sha256,
        storage_key: "guest/asset-guest/version-guest",
        source: "paste",
        created_at: "2026-09-16T00:00:00.000Z",
        data: PNG,
      },
      bytes: PNG,
    });
    expect(backing.has(GUEST_VISUAL_ASSETS_KEY)).toBe(true);
    expect(await guestVisualAssetStore.readVersion("asset-guest")).toEqual(PNG);
    expect((await guestVisualAssetStore.getAsset("asset-guest"))?.user_id).toBe(
      "guest",
    );
  });

  it("keeps a deleted asset recoverable without deleting its immutable versions", async () => {
    const state = {
      assets: [
        {
          id: "asset-deleted",
          user_id: "guest",
          workspace_id: "ws-guest",
          current_version_id: "v1",
          mime_type: "image/png",
          byte_size: PNG.length,
          width: 1,
          height: 1,
          sha256: await calculateVisualSha256(PNG),
          source: "upload" as const,
          status: "deleted" as const,
          version_count: 1,
          created_at: "",
          updated_at: "",
        },
      ],
      versions: [],
      annotations: [],
      derived: [],
      relations: [],
      drafts: [],
    };
    await guestVisualAssetStore.importState(state);
    expect(await guestVisualAssetStore.getAsset("asset-deleted")).toBeNull();
    expect(
      (await guestVisualAssetStore.getAssetIncludingDeleted("asset-deleted"))
        ?.status,
    ).toBe("deleted");
  });
});
