import { describe, expect, it } from "vitest";
import { createKagelinMcpServer } from "../../../mcp-server/server";
import { GuestAssetBridgeHttpHost } from "../../../mcp-server/guest-bridge-host";
import { McpMockBackend } from "../../../mcp-server/mock-backend";
import type { Workspace, WorkspaceNode } from "@/lib/types/workspace";
import type { VisualAsset, VisualAssetVersion } from "@/lib/types/visual";
import {
  createGuestAssetBridgeHandler,
  pairGuestAssetBridgeBrowser,
} from "@/lib/visual/guest-asset-bridge";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const workspace: Workspace = {
  id: "ws-guest-http",
  user_id: "guest",
  name: "Guest HTTP workspace",
  color: "#123456",
  created_at: "2026-09-16T00:00:00Z",
  updated_at: "2026-09-16T00:00:00Z",
};

const imageNode: WorkspaceNode = {
  id: "image-node-http",
  workspace_id: workspace.id,
  user_id: "guest",
  kind: "image",
  entity_type: "visual_asset",
  entity_id: "asset-http",
  position_x: 10,
  position_y: 20,
  width: 320,
  height: 240,
  group_id: null,
  display_config: { title: "HTTP reference", versionId: "version-http" },
  created_at: workspace.created_at,
  updated_at: workspace.updated_at,
};

const asset: VisualAsset = {
  id: "asset-http",
  user_id: "guest",
  workspace_id: workspace.id,
  current_version_id: "version-http",
  mime_type: "image/png",
  byte_size: Buffer.from(PNG_BASE64, "base64").length,
  width: 1,
  height: 1,
  sha256: "fixture-hash-http",
  source: "upload",
  source_uri: null,
  title: "HTTP reference",
  alt_text: "A reference pixel",
  status: "active",
  version_count: 1,
  created_at: workspace.created_at,
  updated_at: workspace.updated_at,
};

const version: VisualAssetVersion = {
  id: "version-http",
  asset_id: asset.id,
  user_id: "guest",
  version_number: 1,
  mime_type: "image/png",
  byte_size: asset.byte_size,
  width: 1,
  height: 1,
  sha256: asset.sha256,
  storage_key: "guest/asset-http/version-http",
  source: "upload",
  source_uri: null,
  replaced_version_id: null,
  created_by: "guest",
  created_at: workspace.created_at,
  data: new Uint8Array(Buffer.from(PNG_BASE64, "base64")),
};

function responseData(response: any): Record<string, any> {
  return JSON.parse(response.content[0].text) as Record<string, any>;
}

function browserFetch(origin: string): typeof fetch {
  return (input, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("origin", origin);
    return fetch(input, { ...init, headers });
  };
}

function makeBrowserBackend(): McpMockBackend {
  return new McpMockBackend({
    userId: "guest",
    workspaces: [workspace],
    nodes: [imageNode],
    visualAssets: [asset],
    visualVersions: [version],
  });
}

describe("Guest asset bridge HTTP host", () => {
  it("carries on-demand image reads and confirmed native flow writes over loopback HTTP", async () => {
    const backend = makeBrowserBackend();
    const host = new GuestAssetBridgeHttpHost({
      port: 0,
      pairingCode: "PAIR-HTTP",
      requestTimeoutMs: 3_000,
    });
    const address = await host.start();
    const origin = "http://localhost:3000";
    let paired:
      Awaited<ReturnType<typeof pairGuestAssetBridgeBrowser>> | undefined;

    try {
      const handler = createGuestAssetBridgeHandler(
        backend.visualStore,
        {
          get: (workspaceId) =>
            backend
              .getState()
              .workspaces.find((item) => item.id === workspaceId) ?? null,
          listNodes: (workspaceId) =>
            backend
              .getState()
              .nodes.filter((item) => item.workspace_id === workspaceId),
          listEdges: (workspaceId) =>
            backend
              .getState()
              .edges.filter((item) => item.workspace_id === workspaceId),
          listWorkspaces: () => backend.getState().workspaces,
        },
        { commandAdapters: backend.commandAdapters },
      );
      paired = await pairGuestAssetBridgeBrowser(
        address.url,
        { workspaceIds: [workspace.id] },
        handler,
        {
          pairingCode: address.pairingCode,
          fetchImpl: browserFetch(origin),
        },
      );

      const server = createKagelinMcpServer({
        useMockFallback: false,
        guestAssetBridge: host.connection,
      }) as any;

      const inspect = await server._registeredTools.inspect_visual.handler({
        workspaceId: workspace.id,
        nodeId: imageNode.id,
        representation: "original",
        supportsImageContent: true,
        purpose: "HTTP bridge read",
      });
      expect(inspect.isError).toBeUndefined();
      expect(inspect.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "image",
            mimeType: "image/png",
            data: PNG_BASE64,
          }),
        ]),
      );

      const imported = await server._registeredTools.import_visual.handler({
        workspaceId: workspace.id,
        source: "base64",
        data: PNG_BASE64,
        mimeType: "image/png",
        nodeId: "http-imported-image",
        title: "Imported through HTTP",
        deduplicate: false,
      });
      const importedData = responseData(imported);
      expect(importedData.mode).toBe("create-asset");
      expect(importedData.node.id).toBe("http-imported-image");
      expect(
        backend
          .getState()
          .visualVersions.some(
            (item) => item.id === importedData.version.id && item.data,
          ),
      ).toBe(true);

      const replacement = await server._registeredTools.update_visual.handler({
        workspaceId: workspace.id,
        assetId: importedData.asset.id,
        replacement: {
          source: "base64",
          data: PNG_BASE64,
          mimeType: "image/png",
        },
        expectedVersionId: importedData.version.id,
        confirmed: true,
      });
      expect(responseData(replacement).version.version_number).toBe(2);

      const annotation = await server._registeredTools.update_visual.handler({
        workspaceId: workspace.id,
        assetId: importedData.asset.id,
        annotation: {
          type: "box",
          geometry: { x: 0, y: 0, width: 1, height: 1 },
          text: "HTTP annotation",
          source: "ai",
        },
      });
      expect(responseData(annotation).annotation.text).toBe("HTTP annotation");

      const relation =
        await server._registeredTools.create_visual_relation.handler({
          workspaceId: workspace.id,
          relationType: "supports",
          sourceType: "visual_asset",
          sourceId: importedData.asset.id,
          targetType: "image_node",
          targetId: "http-imported-image",
        });
      expect(responseData(relation).relation.relation_type).toBe("supports");

      const update = await server._registeredTools.update_visual.handler({
        workspaceId: workspace.id,
        assetId: asset.id,
        title: "Renamed through HTTP",
        requestId: "guest-http-update-1",
      });
      expect(responseData(update).asset.title).toBe("Renamed through HTTP");
      expect(backend.getState().visualAssets[0].title).toBe(
        "Renamed through HTTP",
      );

      const draft = await server._registeredTools.draft_visual_to_flow.handler({
        workspaceId: workspace.id,
        target: { nodeId: imageNode.id },
        nodes: [
          {
            id: "http-draft-step",
            kind: "step",
            title: "Verify HTTP image",
            position: { x: 100, y: 100 },
          },
          {
            id: "http-draft-decision",
            kind: "decision",
            title: "Is the bridge authorized?",
            position: { x: 500, y: 100 },
          },
        ],
        edges: [
          {
            id: "http-draft-edge",
            fromNodeId: "http-draft-step",
            toNodeId: "http-draft-decision",
            label: "review",
          },
        ],
      });
      const draftData = responseData(draft);
      expect(draftData.draft.status).toBe("pending");
      expect(
        backend.getState().nodes.some((item) => item.id === "http-draft-step"),
      ).toBe(false);

      const confirmed =
        await server._registeredTools.confirm_visual_flow.handler({
          draftId: draftData.draft.id,
          confirmed: true,
          requestId: "guest-http-confirm-1",
        });
      const confirmedData = responseData(confirmed);
      expect(confirmedData.writesPerformed).toBe(true);
      expect(confirmedData.draft.status).toBe("confirmed");
      expect(backend.getState().nodes.map((item) => item.id)).toEqual(
        expect.arrayContaining(["http-draft-step", "http-draft-decision"]),
      );
      expect(backend.getState().edges.map((item) => item.id)).toContain(
        "http-draft-edge",
      );
    } finally {
      await paired?.session.stop();
      await host.close();
    }
  });

  it("requires the displayed pairing code and the exact browser Origin", async () => {
    const host = new GuestAssetBridgeHttpHost({
      port: 0,
      pairingCode: "PAIR-SECURE",
    });
    const address = await host.start();
    try {
      const wrongCode = await browserFetch("http://localhost:3000")(
        `${address.url}/pair`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            pairingCode: "WRONG",
            workspaceIds: [workspace.id],
          }),
        },
      );
      expect(wrongCode.status).toBe(400);
      expect((await wrongCode.json()).reason).toBe("invalid_request");

      const paired = await browserFetch("http://localhost:3000")(
        `${address.url}/pair`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            pairingCode: address.pairingCode,
            workspaceIds: [workspace.id],
          }),
        },
      );
      const pairedBody = await paired.json();
      expect(paired.status).toBe(200);

      const wrongOrigin = await browserFetch("http://evil.local")(
        `${address.url}/request?token=${encodeURIComponent(pairedBody.grant.token)}`,
        {
          headers: { accept: "application/json" },
        },
      );
      expect(wrongOrigin.status).toBe(403);
      expect((await wrongOrigin.json()).reason).toBe("origin_mismatch");
    } finally {
      await host.close();
    }
  });
});
