import { nodeCommands, type NodeCommandContext } from "@/lib/commands/node";
import {
  createCurrentVisualService,
  visualMutations,
} from "@/lib/mutations/visual";
import type {
  CreateVisualAnnotationInput,
  CreateVisualFlowDraftInput,
  CreateVisualRelationInput,
  ReplaceVisualAssetInput,
  VisualWorkspaceService,
} from "@/lib/visual/service";
import type { VisualAssetSource, VisualBytes } from "@/lib/types/visual";
import type { WorkspaceNode } from "@/lib/types/workspace";

export interface VisualCommandContext extends NodeCommandContext {
  /** Test/MCP seam; production UI resolves the account adapter lazily. */
  visualService?: VisualWorkspaceService;
}

async function resolveService(
  ctx: VisualCommandContext,
): Promise<VisualWorkspaceService> {
  return ctx.visualService ?? createCurrentVisualService();
}

export interface CreateImageNodeInput {
  workspaceId: string;
  position: { x: number; y: number };
  bytes: VisualBytes;
  mimeType?: string;
  source?: VisualAssetSource;
  sourceUri?: string | null;
  title?: string | null;
  altText?: string | null;
  role?: string;
  versionId?: string;
  assetId?: string;
  deduplicate?: boolean;
  groupId?: string | null;
}

/** Create the asset first, then the referencing image node through node.add. */
export async function createImageNode(
  ctx: VisualCommandContext,
  input: CreateImageNodeInput,
): Promise<{ node: WorkspaceNode; assetId: string; versionId: string }> {
  const service = await resolveService(ctx);
  const created = await service.ingest({
    workspaceId: input.workspaceId,
    bytes: input.bytes,
    mimeType: input.mimeType,
    source: input.source,
    sourceUri: input.sourceUri,
    title: input.title,
    altText: input.altText,
    assetId: input.assetId,
    versionId: input.versionId,
    deduplicate: input.deduplicate,
  });
  try {
    const node = await nodeCommands.add(ctx, {
      workspaceId: input.workspaceId,
      kind: "image",
      entityType: "visual_asset",
      entityId: created.asset.id,
      position: input.position,
      width: 320,
      height: 240,
      groupId: input.groupId,
      displayConfig: {
        title: input.title ?? created.asset.title ?? "",
        role: input.role ?? "",
        altText: input.altText ?? created.asset.alt_text ?? "",
        versionId: created.version.id,
      },
    });
    return { node, assetId: created.asset.id, versionId: created.version.id };
  } catch (error) {
    if (!created.reused) {
      try {
        await service.store.removeAsset(created.asset.id);
      } catch (cleanupError) {
        throw new Error(
          `Image node creation failed after asset ${created.asset.id} was saved; cleanup also failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
          { cause: error },
        );
      }
    }
    throw error;
  }
}

export async function attachImageAsset(
  ctx: VisualCommandContext,
  input: {
    workspaceId: string;
    assetId: string;
    position: { x: number; y: number };
    title?: string;
    role?: string;
    altText?: string;
    versionId?: string;
    groupId?: string | null;
  },
): Promise<WorkspaceNode> {
  const service = await resolveService(ctx);
  const resolved = await service.resolveTarget({
    workspaceId: input.workspaceId,
    assetId: input.assetId,
  });
  const version = await service.store.getVersion(
    resolved.asset.id,
    input.versionId,
  );
  if (!version)
    throw new Error(`Visual asset version "${input.versionId}" was not found.`);
  return nodeCommands.add(ctx, {
    workspaceId: input.workspaceId,
    kind: "image",
    entityType: "visual_asset",
    entityId: resolved.asset.id,
    position: input.position,
    width: 320,
    height: 240,
    groupId: input.groupId,
    displayConfig: {
      title: input.title ?? resolved.asset.title ?? "",
      role: input.role ?? "",
      altText: input.altText ?? resolved.asset.alt_text ?? "",
      versionId: version.id,
    },
  });
}

export async function updateImageNodeMetadata(
  ctx: VisualCommandContext,
  input: {
    workspaceId: string;
    nodeId: string;
    assetId?: string;
    title?: string;
    role?: string;
    altText?: string;
    expectedVersionId?: string;
  },
): Promise<void> {
  const service = await resolveService(ctx);
  if (
    input.assetId &&
    (input.title !== undefined || input.altText !== undefined)
  ) {
    await service.updateMetadata(
      input.assetId,
      {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.altText !== undefined ? { altText: input.altText } : {}),
      },
      input.expectedVersionId,
    );
  }
  await nodeCommands.updateImageNode(ctx, {
    workspaceId: input.workspaceId,
    nodeId: input.nodeId,
    title: input.title,
    role: input.role,
    altText: input.altText,
  });
}

export async function replaceImageVersion(
  ctx: VisualCommandContext,
  input: ReplaceVisualAssetInput & {
    workspaceId: string;
    nodeId?: string;
  },
): Promise<{ assetId: string; versionId: string }> {
  const service = await resolveService(ctx);
  const replaced = await service.replaceVersion(input);
  if (input.nodeId) {
    await nodeCommands.updateImageNode(ctx, {
      workspaceId: input.workspaceId,
      nodeId: input.nodeId,
      versionId: replaced.version.id,
    });
  }
  return { assetId: replaced.asset.id, versionId: replaced.version.id };
}

export const visualCommands = {
  createImageNode,
  attachImageAsset,
  updateImageNodeMetadata,
  replaceImageVersion,
  addAnnotation: async (
    ctx: VisualCommandContext,
    input: CreateVisualAnnotationInput,
  ) => (await resolveService(ctx)).addAnnotation(input),
  createRelation: async (
    ctx: VisualCommandContext,
    input: CreateVisualRelationInput,
  ) => (await resolveService(ctx)).createRelation(input),
  createFlowDraft: async (
    ctx: VisualCommandContext,
    input: CreateVisualFlowDraftInput,
  ) => (await resolveService(ctx)).createFlowDraft(input),
};

export { visualMutations };
