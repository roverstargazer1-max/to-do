import { createClient } from "@/lib/supabase/client";
import { workspaceMutations } from "@/lib/mutations/workspace";
import { guestVisualAssetStore } from "@/lib/visual/guest-store";
import { SupabaseVisualAssetStore } from "@/lib/visual/supabase-store";
import {
  VisualWorkspaceService,
  type CreateVisualAnnotationInput,
  type CreateVisualAssetInput,
  type CreateVisualFlowDraftInput,
  type CreateVisualRelationInput,
  type InspectVisualOptions,
  type ReplaceVisualAssetInput,
  type VisualMetadataPatch,
} from "@/lib/visual/service";
import type { VisualAssetStore } from "@/lib/visual/store";

export function isGuestVisualMode(): boolean {
  return (
    typeof window !== "undefined" &&
    localStorage.getItem("kanso_guest_mode") === "true"
  );
}

async function currentVisualUserId(): Promise<string> {
  if (isGuestVisualMode()) return "guest";
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (user) return user.id;
  if (process.env.KAGELIN_MCP_USER_ID) return process.env.KAGELIN_MCP_USER_ID;
  throw new Error("Not authenticated");
}

function currentStore(): VisualAssetStore {
  return isGuestVisualMode()
    ? guestVisualAssetStore
    : new SupabaseVisualAssetStore(createClient());
}

export async function createCurrentVisualService(): Promise<VisualWorkspaceService> {
  const userId = await currentVisualUserId();
  return new VisualWorkspaceService(currentStore(), {
    userId,
    getWorkspace: async (workspaceId) =>
      (await workspaceMutations.list()).find(
        (workspace) => workspace.id === workspaceId,
      ),
    listNodes: (workspaceId) => workspaceMutations.listNodes(workspaceId),
  });
}

/** Application-facing mutation facade. All operations use the shared service. */
export const visualMutations = {
  ingest: async (input: CreateVisualAssetInput) =>
    (await createCurrentVisualService()).ingest(input),
  createAsset: async (input: CreateVisualAssetInput) =>
    (await createCurrentVisualService()).createAsset(input),
  getAsset: async (assetId: string) => currentStore().getAsset(assetId),
  readVersion: async (assetId: string, versionId?: string) =>
    (await createCurrentVisualService()).readVersion(assetId, versionId),
  describe: async (
    target: Parameters<VisualWorkspaceService["describeVisual"]>[0],
  ) => (await createCurrentVisualService()).describeVisual(target),
  inspect: async (
    target: Parameters<VisualWorkspaceService["inspectVisual"]>[0],
    options?: InspectVisualOptions,
  ) => (await createCurrentVisualService()).inspectVisual(target, options),
  replace: async (input: ReplaceVisualAssetInput) =>
    (await createCurrentVisualService()).replaceVersion(input),
  updateMetadata: async (
    assetId: string,
    patch: VisualMetadataPatch,
    expectedVersionId?: string,
  ) =>
    (await createCurrentVisualService()).updateMetadata(
      assetId,
      patch,
      expectedVersionId,
    ),
  deleteAsset: async (
    assetId: string,
    confirmed: boolean,
    expectedVersionId?: string,
  ) =>
    (await createCurrentVisualService()).deleteAsset(
      assetId,
      confirmed,
      expectedVersionId,
    ),
  restoreAsset: async (assetId: string) =>
    (await createCurrentVisualService()).restoreAsset(assetId),
  addAnnotation: async (input: CreateVisualAnnotationInput) =>
    (await createCurrentVisualService()).addAnnotation(input),
  listAnnotations: async (assetId: string, versionId?: string) =>
    (await createCurrentVisualService()).listAnnotations(assetId, versionId),
  createRelation: async (input: CreateVisualRelationInput) =>
    (await createCurrentVisualService()).createRelation(input),
  updateRelation: async (
    input: Parameters<VisualWorkspaceService["updateRelation"]>[0],
  ) => (await createCurrentVisualService()).updateRelation(input),
  listRelations: async (workspaceId: string) =>
    (await createCurrentVisualService()).listRelations(workspaceId),
  removeRelation: async (workspaceId: string, relationId: string) =>
    (await createCurrentVisualService()).removeRelation(
      workspaceId,
      relationId,
    ),
  createFlowDraft: async (input: CreateVisualFlowDraftInput) =>
    (await createCurrentVisualService()).createFlowDraft(input),
};

export { currentStore as getCurrentVisualStore };
