import { describe, expect, it } from "vitest";
import type { Workspace, WorkspaceNode } from "@/lib/types/workspace";
import type { VisualAsset, VisualAssetVersion } from "@/lib/types/visual";
import { InMemoryVisualAssetStore } from "@/lib/visual/store";
import {
  createGuestAssetBridgeConnection,
  createGuestAssetBridgeHandler,
  GuestAssetBridgeClient,
  GuestAssetBridgeManager,
  GuestAssetBridgeStore,
} from "@/lib/visual/guest-asset-bridge";

const bytes = new Uint8Array([1, 2, 3]);
const workspace: Workspace = {
  id: "ws-guest",
  user_id: "guest",
  name: "Guest",
  color: null,
  created_at: "2026-09-16T00:00:00.000Z",
  updated_at: "2026-09-16T00:00:00.000Z",
};
const imageNode: WorkspaceNode = {
  id: "node-image",
  workspace_id: workspace.id,
  user_id: "guest",
  kind: "image",
  entity_type: "visual_asset",
  entity_id: "asset-guest",
  position_x: 0,
  position_y: 0,
  width: 320,
  height: 240,
  group_id: null,
  display_config: {},
  created_at: workspace.created_at,
  updated_at: workspace.updated_at,
};
const asset: VisualAsset = {
  id: "asset-guest",
  user_id: "guest",
  workspace_id: workspace.id,
  current_version_id: "version-guest",
  mime_type: "image/png",
  byte_size: bytes.length,
  width: 1,
  height: 1,
  sha256: "a".repeat(64),
  source: "upload",
  status: "active",
  version_count: 1,
  created_at: workspace.created_at,
  updated_at: workspace.updated_at,
};
const version: VisualAssetVersion = {
  id: "version-guest",
  asset_id: asset.id,
  user_id: "guest",
  version_number: 1,
  mime_type: "image/png",
  byte_size: bytes.length,
  width: 1,
  height: 1,
  sha256: asset.sha256,
  storage_key: "guest/asset-guest/version-guest",
  source: "upload",
  created_at: workspace.created_at,
  data: bytes,
};

function makeBridge(
  options: ConstructorParameters<typeof GuestAssetBridgeManager>[0] = {},
) {
  const store = new InMemoryVisualAssetStore({
    assets: [asset],
    versions: [version],
  });
  const manager = new GuestAssetBridgeManager({
    tokenFactory: () => "bridge-token",
    ...options,
  });
  const handler = createGuestAssetBridgeHandler(store, {
    get: (workspaceId) => (workspaceId === workspace.id ? workspace : null),
    listNodes: (workspaceId) =>
      workspaceId === workspace.id ? [imageNode] : [],
    listEdges: () => [],
    listWorkspaces: () => [workspace],
  });
  const grant = manager.pair({
    origin: "http://localhost:3000",
    workspaceIds: [workspace.id],
  });
  const client = new GuestAssetBridgeClient(
    manager.createTransport(grant, handler),
    grant,
  );
  return { client, manager, grant, store };
}

describe("Guest asset bridge", () => {
  it("routes explicitly scoped workspace and asset reads through the bridge", async () => {
    const { client } = makeBridge();
    const connection = createGuestAssetBridgeConnection(client);
    expect(await connection.getWorkspace(workspace.id)).toEqual(workspace);
    expect(await connection.listNodes(workspace.id)).toEqual([imageNode]);

    const visualStore = new GuestAssetBridgeStore(client);
    expect(await visualStore.getAsset(asset.id)).toEqual(asset);
    expect(await visualStore.readVersion(asset.id)).toEqual(bytes);
  });

  it("rejects scope escalation, broad state operations, oversized payloads, and revocation", async () => {
    const { client, manager, grant } = makeBridge({ maxRequestBytes: 4 });
    await expect(
      client.request("workspace.get", {
        requestId: "scope-1",
        workspaceId: "ws-other",
        payload: { workspaceId: "ws-other" },
      }),
    ).rejects.toMatchObject({
      reason: "workspace_not_allowed",
    });
    await expect(
      client.request("visual.exportState", {
        requestId: "broad-1",
        payload: {},
      }),
    ).rejects.toMatchObject({
      reason: "operation_not_allowed",
    });
    await expect(
      client.request("visual.getAsset", {
        requestId: "size-1",
        assetId: asset.id,
        payload: { assetId: asset.id, oversized: "12345" },
      }),
    ).rejects.toMatchObject({
      reason: "invalid_request",
    });

    manager.revoke(grant.token);
    await expect(
      client.request("visual.getAsset", {
        requestId: "revoked-1",
        assetId: asset.id,
        payload: { assetId: asset.id },
      }),
    ).rejects.toMatchObject({ reason: "revoked" });
  });

  it("records origin failures and does not expose a foreign origin", async () => {
    const { manager, grant, store } = makeBridge();
    const handler = createGuestAssetBridgeHandler(store, {
      get: () => workspace,
      listNodes: () => [imageNode],
    });
    await expect(
      manager.dispatch(
        {
          token: grant.token,
          origin: "http://evil.local",
          operation: "workspace.get",
          workspaceId: workspace.id,
          requestId: "origin-1",
          payload: { workspaceId: workspace.id },
        },
        handler,
      ),
    ).rejects.toMatchObject({ reason: "origin_mismatch" });
    expect(manager.listEvents().at(-1)).toEqual(
      expect.objectContaining({ requestId: "origin-1", outcome: "rejected" }),
    );
  });

  it("reports expiry and browser/client disconnect as unavailable", async () => {
    let now = 1_000;
    const expired = makeBridge({ now: () => now });
    await expect(
      expired.client.request("workspace.get", {
        requestId: "expiry-before",
        workspaceId: workspace.id,
        payload: { workspaceId: workspace.id },
      }),
    ).resolves.toEqual(workspace);
    now = expired.grant.expiresAt;
    await expect(
      expired.client.request("workspace.get", {
        requestId: "expiry-after",
        workspaceId: workspace.id,
        payload: { workspaceId: workspace.id },
      }),
    ).rejects.toMatchObject({ reason: "expired" });

    const disconnected = makeBridge();
    disconnected.client.close();
    await expect(
      disconnected.client.request("workspace.get", {
        requestId: "disconnect-after",
        workspaceId: workspace.id,
        payload: { workspaceId: workspace.id },
      }),
    ).rejects.toMatchObject({ reason: "revoked" });
  });
});
