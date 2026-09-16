import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createKagelinMcpServer } from "../../../mcp-server/server";
import type { Workspace, WorkspaceNode } from "@/lib/types/workspace";
import type { VisualAsset, VisualAssetVersion } from "@/lib/types/visual";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function data(response: any): Record<string, any> {
  return JSON.parse(response.content[0].text) as Record<string, any>;
}

function makeWorkspace(): Workspace {
  return {
    id: "ws-visual",
    user_id: "visual-user",
    name: "Visual workspace",
    color: "#123456",
    created_at: "2026-09-16T00:00:00Z",
    updated_at: "2026-09-16T00:00:00Z",
  };
}

function makeImageNode(): WorkspaceNode {
  return {
    id: "image-node-1",
    workspace_id: "ws-visual",
    user_id: "visual-user",
    kind: "image",
    entity_type: "visual_asset",
    entity_id: "asset-1",
    position_x: 10,
    position_y: 20,
    width: 320,
    height: 240,
    group_id: null,
    display_config: {
      title: "Reference",
      role: "evidence",
      versionId: "version-1",
    },
    created_at: "2026-09-16T00:00:00Z",
    updated_at: "2026-09-16T00:00:00Z",
  };
}

function makeAsset(): VisualAsset {
  return {
    id: "asset-1",
    user_id: "visual-user",
    workspace_id: "ws-visual",
    current_version_id: "version-1",
    mime_type: "image/png",
    byte_size: Buffer.from(PNG_BASE64, "base64").length,
    width: 1,
    height: 1,
    sha256: "fixture-hash",
    source: "upload",
    source_uri: null,
    title: "Reference",
    alt_text: "A reference pixel",
    status: "active",
    version_count: 1,
    created_at: "2026-09-16T00:00:00Z",
    updated_at: "2026-09-16T00:00:00Z",
  };
}

function makeVersion(): VisualAssetVersion {
  return {
    id: "version-1",
    asset_id: "asset-1",
    user_id: "visual-user",
    version_number: 1,
    mime_type: "image/png",
    byte_size: Buffer.from(PNG_BASE64, "base64").length,
    width: 1,
    height: 1,
    sha256: "fixture-hash",
    storage_key: "visual-user/asset-1/version-1",
    source: "upload",
    source_uri: null,
    replaced_version_id: null,
    created_by: "visual-user",
    created_at: "2026-09-16T00:00:00Z",
    data: new Uint8Array(Buffer.from(PNG_BASE64, "base64")),
  };
}

function makeServer() {
  return createKagelinMcpServer({
    useMockFallback: true,
    identity: "visual-user",
    initialWorkspaces: [makeWorkspace()],
    initialNodes: [makeImageNode()],
    initialVisualAssets: [makeAsset()],
    initialVisualVersions: [makeVersion()],
  });
}

describe("MCP visual contract", () => {
  it("returns only lightweight image metadata in the blueprint and reads image content on demand", async () => {
    const server = makeServer() as any;
    const blueprint =
      await server._registeredTools.get_workspace_blueprint.handler({
        workspaceId: "ws-visual",
      });
    const blueprintData = data(blueprint);
    expect(blueprintData.snapshot.standaloneItems[0].visual.assetId).toBe(
      "asset-1",
    );
    expect(blueprint.content[0].text).not.toContain(PNG_BASE64);

    const inspect = await server._registeredTools.inspect_visual.handler({
      workspaceId: "ws-visual",
      nodeId: "image-node-1",
      representation: "original",
      supportsImage: true,
      purpose: "verify the reference",
    });
    expect(inspect.isError).toBeUndefined();
    expect(inspect.content).toHaveLength(2);
    expect(inspect.content[1]).toEqual(
      expect.objectContaining({ type: "image", mimeType: "image/png" }),
    );
    expect(data(inspect).representation).toBe("original");
    expect(data(inspect)).not.toHaveProperty("bytes");
  });

  it("gives an honest text fallback and rejects implicit canvas selection", async () => {
    const server = makeServer() as any;
    const fallback = await server._registeredTools.inspect_visual.handler({
      workspaceId: "ws-visual",
      assetId: "asset-1",
      supportsImageContent: false,
    });
    expect(data(fallback).fallback.equivalentToImage).toBe(false);
    expect(fallback.content).toHaveLength(1);

    const missingTarget = await server._registeredTools.inspect_visual.handler({
      workspaceId: "ws-visual",
    });
    expect(missingTarget.isError).toBe(true);
    expect(data(missingTarget).error.category).toBe("invalid_input");
  });

  it("imports, updates, and replaces without putting bytes in the image node", async () => {
    const server = makeServer() as any;
    const imported = await server._registeredTools.import_visual.handler({
      workspaceId: "ws-visual",
      source: "base64",
      data: PNG_BASE64,
      mimeType: "image/png",
      nodeId: "image-node-2",
      title: "Imported",
    });
    const importedData = data(imported);
    expect(importedData.mode).toBe("create-asset");
    expect(importedData.node).toEqual(
      expect.objectContaining({ kind: "image", entity_type: "visual_asset" }),
    );
    expect(JSON.stringify(importedData.node)).not.toContain(PNG_BASE64);

    const update = await server._registeredTools.update_visual.handler({
      workspaceId: "ws-visual",
      nodeId: "image-node-2",
      title: "Renamed imported image",
      role: "reference",
    });
    expect(data(update).asset.title).toBe("Renamed imported image");
    expect(data(update).nodeId).toBe("image-node-2");

    const replacementNeedsConfirmation =
      await server._registeredTools.update_visual.handler({
        workspaceId: "ws-visual",
        assetId: importedData.asset.id,
        replacement: {
          source: "base64",
          data: PNG_BASE64,
          mimeType: "image/png",
        },
      });
    expect(data(replacementNeedsConfirmation).error.category).toBe(
      "confirmation_required",
    );

    const replacement = await server._registeredTools.update_visual.handler({
      workspaceId: "ws-visual",
      assetId: importedData.asset.id,
      replacement: {
        source: "base64",
        data: PNG_BASE64,
        mimeType: "image/png",
      },
      expectedVersionId: importedData.version.id,
      confirmed: true,
    });
    expect(data(replacement).version.version_number).toBe(2);
    expect(data(replacement).asset.version_count).toBe(2);
  });

  it("keeps Visual relations separate and requires confirmation before native flow writes", async () => {
    const server = makeServer() as any;
    const relation =
      await server._registeredTools.create_visual_relation.handler({
        workspaceId: "ws-visual",
        relationType: "supports",
        sourceType: "visual_asset",
        sourceId: "asset-1",
        targetType: "image_node",
        targetId: "image-node-1",
      });
    expect(data(relation).relation.relation_type).toBe("supports");

    const draft = await server._registeredTools.draft_visual_to_flow.handler({
      workspaceId: "ws-visual",
      target: { nodeId: "image-node-1" },
      nodes: [
        {
          id: "draft-step",
          kind: "step",
          title: "Verify screenshot",
          position: { x: 100, y: 100 },
        },
        {
          id: "draft-decision",
          kind: "decision",
          title: "Is it approved?",
          position: { x: 500, y: 100 },
        },
      ],
      edges: [
        {
          id: "draft-edge",
          fromNodeId: "draft-step",
          toNodeId: "draft-decision",
          label: "review",
        },
      ],
    });
    expect(data(draft).draft.status).toBe("pending");
    expect(data(draft).draft.source_version_id).toBe("version-1");

    const confirmed = await server._registeredTools.confirm_visual_flow.handler(
      {
        draftId: data(draft).draft.id,
        confirmed: true,
        requestId: "confirm-visual-flow-1",
      },
    );
    expect(data(confirmed).writesPerformed).toBe(true);
    expect(data(confirmed).result.createdNodeIds).toEqual([
      "draft-step",
      "draft-decision",
    ]);
    expect(data(confirmed).draft.status).toBe("confirmed");

    const replay = await server._registeredTools.confirm_visual_flow.handler({
      draftId: data(draft).draft.id,
      confirmed: true,
      requestId: "confirm-visual-flow-1",
    });
    expect(data(replay).status).toBe("replayed");
    expect(data(replay).replayed).toBe(true);
  });

  it("exposes the visual contract through the standard MCP protocol", async () => {
    const server = makeServer();
    const client = new Client({
      name: "kagelin-visual-contract-test",
      version: "1.0.0",
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining([
          "get_workspace_blueprint",
          "inspect_visual",
          "import_visual",
          "update_visual",
          "draft_visual_to_flow",
          "confirm_visual_flow",
        ]),
      );

      const inspected = await client.callTool({
        name: "inspect_visual",
        arguments: {
          workspaceId: "ws-visual",
          nodeId: "image-node-1",
          representation: "original",
          supportsImageContent: true,
        },
      });
      expect(inspected.isError).not.toBe(true);
      expect(inspected.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "image",
            mimeType: "image/png",
            data: PNG_BASE64,
          }),
        ]),
      );

      const textFallback = await client.callTool({
        name: "inspect_visual",
        arguments: {
          workspaceId: "ws-visual",
          assetId: "asset-1",
          supportsImageContent: false,
        },
      });
      expect(textFallback.isError).not.toBe(true);
      const fallbackContent = (
        textFallback.content as Array<{ type: string; text?: string }>
      )[0];
      expect(textFallback.content).toHaveLength(1);
      expect(fallbackContent?.type).toBe("text");
      const fallbackPayload = JSON.parse(fallbackContent?.text ?? "{}") as {
        fallback?: { equivalentToImage?: boolean };
      };
      expect(fallbackPayload.fallback?.equivalentToImage).toBe(false);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
