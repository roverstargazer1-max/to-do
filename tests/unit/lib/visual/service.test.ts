import { describe, expect, it, vi } from "vitest";
import type { Workspace, WorkspaceNode } from "@/lib/types/workspace";
import { InMemoryVisualAssetStore } from "@/lib/visual/store";
import { VisualWorkspaceService } from "@/lib/visual/service";

const PNG = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);

const workspace: Workspace = {
  id: "ws-1",
  user_id: "user-1",
  name: "Visual",
  color: null,
  created_at: "2026-09-16T00:00:00Z",
  updated_at: "2026-09-16T00:00:00Z",
};

function service(
  store = new InMemoryVisualAssetStore(),
  nodes: WorkspaceNode[] = [],
) {
  return new VisualWorkspaceService(store, {
    userId: "user-1",
    getWorkspace: (id) => (id === workspace.id ? workspace : null),
    listNodes: () => nodes,
    idFactory: (() => {
      let count = 0;
      return (prefix: string) => `${prefix}-${++count}`;
    })(),
  });
}

describe("VisualWorkspaceService", () => {
  it("ingests a validated asset, deduplicates it, and keeps node bytes out of metadata", async () => {
    const store = new InMemoryVisualAssetStore();
    const visual = service(store);
    const first = await visual.ingest({
      workspaceId: workspace.id,
      bytes: PNG,
      mimeType: "image/png",
      title: "Screenshot",
    });
    const duplicate = await visual.ingest({
      workspaceId: workspace.id,
      bytes: PNG,
      mimeType: "image/png",
    });
    expect(first.reused).toBe(false);
    expect(duplicate.reused).toBe(true);
    expect(duplicate.asset.id).toBe(first.asset.id);
    expect(duplicate.asset).not.toHaveProperty("data");
    expect((await store.exportState()).versions[0].data).toEqual(PNG);
  });

  it("generates database-compatible UUIDs for default asset identifiers", async () => {
    const visual = new VisualWorkspaceService(new InMemoryVisualAssetStore(), {
      userId: "user-1",
      getWorkspace: (id) => (id === workspace.id ? workspace : null),
    });

    const created = await visual.ingest({
      workspaceId: workspace.id,
      bytes: PNG,
      mimeType: "image/png",
    });

    expect(created.asset.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(created.version.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("appends immutable versions and marks derived observations stale", async () => {
    const store = new InMemoryVisualAssetStore();
    const visual = service(store);
    const created = await visual.ingest({
      workspaceId: workspace.id,
      bytes: PNG,
    });
    await visual.putDerived({
      asset_id: created.asset.id,
      version_id: created.version.id,
      kind: "description",
      value: "a screenshot",
      source: "ai",
      status: "ready",
    });
    const replacement = await visual.replaceVersion({
      assetId: created.asset.id,
      bytes: PNG,
      expectedVersionId: created.version.id,
      source: "generated",
    });
    expect(replacement.version.version_number).toBe(2);
    expect(replacement.version.replaced_version_id).toBe(created.version.id);
    expect(
      (await store.getVersion(created.asset.id, created.version.id))
        ?.version_number,
    ).toBe(1);
    expect((await store.listDerived(created.asset.id))[0].status).toBe("stale");
  });

  it("requires explicit targets and reports ambiguity, stale writes, and lifecycle confirmation", async () => {
    const store = new InMemoryVisualAssetStore();
    const nodeA: WorkspaceNode = {
      id: "image-a",
      workspace_id: workspace.id,
      user_id: "user-1",
      kind: "image",
      entity_type: "visual_asset",
      entity_id: "asset-a",
      position_x: 0,
      position_y: 0,
      width: 320,
      height: 240,
      group_id: null,
      display_config: { title: "Same" },
      created_at: "",
      updated_at: "",
    };
    const nodeB = { ...nodeA, id: "image-b", entity_id: "asset-b" };
    const visual = service(store, [nodeA, nodeB]);
    const assetA = await visual.ingest({
      workspaceId: workspace.id,
      bytes: PNG,
      assetId: "asset-a",
    });
    await visual.ingest({
      workspaceId: workspace.id,
      bytes: PNG,
      assetId: "asset-b",
      deduplicate: false,
    });
    await expect(
      visual.describeVisual({ workspaceId: workspace.id }),
    ).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(
      visual.resolveTarget({ workspaceId: workspace.id, title: "Same" }),
    ).rejects.toMatchObject({
      code: "target_ambiguous",
    });
    await expect(
      visual.replaceVersion({
        assetId: assetA.asset.id,
        bytes: PNG,
        expectedVersionId: "old",
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    await expect(
      visual.deleteAsset(assetA.asset.id, false),
    ).rejects.toMatchObject({
      code: "confirmation_required",
    });
    const deleted = await visual.deleteAsset(assetA.asset.id, true);
    expect(deleted.status).toBe("deleted");
    expect(await store.getAsset(assetA.asset.id)).toBeNull();
    expect((await visual.restoreAsset(assetA.asset.id)).status).toBe("active");
  });

  it("only accepts relation version IDs that belong to the visual endpoint", async () => {
    const store = new InMemoryVisualAssetStore();
    const stepNode: WorkspaceNode = {
      id: "step-1",
      workspace_id: workspace.id,
      user_id: "user-1",
      kind: "step",
      entity_type: "task",
      entity_id: "task-1",
      position_x: 0,
      position_y: 0,
      width: 320,
      height: 180,
      group_id: null,
      display_config: { title: "Review" },
      created_at: "",
      updated_at: "",
    };
    const visual = service(store, [stepNode]);
    const first = await visual.ingest({
      workspaceId: workspace.id,
      bytes: PNG,
      assetId: "asset-first",
    });
    const second = await visual.ingest({
      workspaceId: workspace.id,
      bytes: PNG,
      assetId: "asset-second",
      deduplicate: false,
    });

    await expect(
      visual.createRelation({
        workspaceId: workspace.id,
        relationType: "reference",
        sourceType: "visual_asset",
        sourceId: first.asset.id,
        sourceVersionId: "missing-version",
        targetType: "step",
        targetId: stepNode.id,
      }),
    ).rejects.toMatchObject({ code: "relation_invalid" });

    await expect(
      visual.createRelation({
        workspaceId: workspace.id,
        relationType: "reference",
        sourceType: "visual_asset",
        sourceId: first.asset.id,
        sourceVersionId: second.version.id,
        targetType: "step",
        targetId: stepNode.id,
      }),
    ).rejects.toMatchObject({ code: "relation_invalid" });

    await expect(
      visual.createRelation({
        workspaceId: workspace.id,
        relationType: "reference",
        sourceType: "step",
        sourceId: stepNode.id,
        sourceVersionId: first.version.id,
        targetType: "visual_asset",
        targetId: first.asset.id,
      }),
    ).rejects.toMatchObject({ code: "relation_invalid" });

    const relation = await visual.createRelation({
      workspaceId: workspace.id,
      relationType: "reference",
      sourceType: "visual_asset",
      sourceId: first.asset.id,
      sourceVersionId: first.version.id,
      targetType: "step",
      targetId: stepNode.id,
    });
    expect(relation.source_version_id).toBe(first.version.id);
    expect(relation.target_version_id).toBeNull();
  });

  it("normalizes pixel crops and uses a server renderer only for requested representations", async () => {
    const renderer = vi.fn(async ({ bytes, representation }: any) => ({
      bytes: Uint8Array.from([...bytes, representation === "crop" ? 1 : 2]),
      mimeType: "image/png",
    }));
    const visual = new VisualWorkspaceService(new InMemoryVisualAssetStore(), {
      userId: "user-1",
      getWorkspace: () => workspace,
      renderVisual: renderer,
    });
    const created = await visual.ingest({
      workspaceId: workspace.id,
      bytes: PNG,
    });
    const crop = await visual.inspectVisual(
      { assetId: created.asset.id },
      {
        representation: "crop",
        crop: { x: 0, y: 0, width: 1, height: 1, coordinateSpace: "pixels" },
      },
    );
    expect(crop.crop).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      coordinateSpace: "normalized",
    });
    expect(crop.transformed).toBe(true);
    expect(renderer).toHaveBeenCalledTimes(1);
  });

  it("rolls back native flow writes when confirmation provenance cannot be saved", async () => {
    const store = new InMemoryVisualAssetStore();
    const rollback = vi.fn(async () => undefined);
    const visual = new VisualWorkspaceService(store, {
      userId: "user-1",
      getWorkspace: () => workspace,
      commitFlow: () => ({
        createdNodeIds: ["created-step"],
        createdEdgeIds: ["created-edge"],
      }),
      rollbackFlow: rollback,
    });
    const asset = await visual.ingest({
      workspaceId: workspace.id,
      bytes: PNG,
    });
    const draft = await visual.createFlowDraft({
      workspaceId: workspace.id,
      target: { assetId: asset.asset.id },
      nodes: [
        {
          id: "draft-step",
          kind: "step",
          title: "Review",
          position: { x: 0, y: 0 },
        },
      ],
    });
    const originalPutDraft = store.putDraft.bind(store);
    let putCount = 1;
    vi.spyOn(store, "putDraft").mockImplementation(async (nextDraft) => {
      putCount += 1;
      if (putCount === 2) throw new Error("draft persistence failed");
      return originalPutDraft(nextDraft);
    });

    await expect(visual.confirmFlowDraft(draft.id, true)).rejects.toMatchObject(
      {
        code: "execution",
        details: expect.objectContaining({
          createdNodeIds: ["created-step"],
          createdEdgeIds: ["created-edge"],
        }),
      },
    );
    expect(rollback).toHaveBeenCalledWith(
      expect.objectContaining({ id: draft.id }),
      expect.objectContaining({ createdNodeIds: ["created-step"] }),
    );
  });
});
