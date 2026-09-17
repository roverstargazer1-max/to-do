import type { Workspace, WorkspaceNode } from "@/lib/types/workspace";
import {
  DEFAULT_VISUAL_ASSET_LIMITS,
  VISUAL_ANNOTATION_TYPES,
  type VisualAnnotation,
  type VisualAnnotationGeometry,
  type VisualAsset,
  type VisualAssetLimits,
  type VisualAssetSource,
  type VisualAssetVersion,
  type VisualBytes,
  type VisualCrop,
  type VisualDerivedInfo,
  type VisualEndpointType,
  type VisualFlowDraft,
  type VisualInspection,
  type VisualRelation,
  type VisualRelationType,
  type VisualRepresentation,
  type VisualTarget,
} from "@/lib/types/visual";
import {
  validateVisualBytes,
  type ValidatedVisualBytes,
  VisualValidationError,
} from "@/lib/visual/validation";
import type { VisualAssetStore } from "@/lib/visual/store";

export type VisualServiceErrorCode =
  | "invalid_input"
  | "asset_not_found"
  | "target_not_found"
  | "target_ambiguous"
  | "authorization"
  | "workspace_not_found"
  | "version_conflict"
  | "confirmation_required"
  | "relation_invalid"
  | "draft_not_found"
  | "draft_stale"
  | "bridge_unavailable"
  | "quota_exceeded"
  | "resource_too_large"
  | "execution";

export class VisualServiceError extends Error {
  readonly code: VisualServiceErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    code: VisualServiceErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "VisualServiceError";
    this.code = code;
    this.details = details;
  }
}

export interface VisualServiceNodeContext {
  getWorkspace?: (
    workspaceId: string,
  ) => Promise<Workspace | null | undefined> | Workspace | null | undefined;
  listNodes?: (
    workspaceId: string,
  ) => Promise<WorkspaceNode[]> | WorkspaceNode[];
}

export interface VisualFlowCommitResult {
  createdNodeIds: string[];
  createdEdgeIds: string[];
}

export interface VisualRenderInput {
  bytes: Uint8Array;
  mimeType: string;
  representation: VisualRepresentation;
  crop?: VisualCrop;
  width: number;
  height: number;
}

export interface VisualWorkspaceServiceOptions extends VisualServiceNodeContext {
  userId: string;
  limits?: Partial<VisualAssetLimits>;
  now?: () => string;
  idFactory?: (prefix: string) => string;
  commitFlow?: (
    draft: VisualFlowDraft,
  ) => Promise<VisualFlowCommitResult> | VisualFlowCommitResult;
  /**
   * Compensates a successful native flow commit when persisting the confirmed
   * draft or its provenance relation fails afterwards.
   */
  rollbackFlow?: (
    draft: VisualFlowDraft,
    result: VisualFlowCommitResult,
  ) => Promise<void> | void;
  renderVisual?: (
    input: VisualRenderInput,
  ) => Promise<{ bytes: Uint8Array; mimeType?: string }>;
}

export interface CreateVisualAssetInput {
  workspaceId: string;
  bytes: VisualBytes;
  mimeType?: string;
  source?: VisualAssetSource;
  sourceUri?: string | null;
  title?: string | null;
  altText?: string | null;
  metadata?: Record<string, unknown> | null;
  assetId?: string;
  versionId?: string;
  deduplicate?: boolean;
}

export interface CreatedVisualAsset {
  asset: VisualAsset;
  version: VisualAssetVersion;
  reused: boolean;
}

export interface ReplaceVisualAssetInput {
  assetId: string;
  bytes: VisualBytes;
  mimeType?: string;
  source?: VisualAssetSource;
  sourceUri?: string | null;
  expectedVersionId?: string;
  versionId?: string;
  sourceAssetId?: string | null;
}

export interface VisualMetadataPatch {
  title?: string | null;
  altText?: string | null;
  sourceUri?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface InspectVisualOptions {
  representation?: VisualRepresentation;
  crop?: VisualCrop;
  versionId?: string;
  expectedVersionId?: string;
  maxResponseBytes?: number;
}

export interface VisualDescriptor {
  assetId: string;
  workspaceId?: string | null;
  nodeId?: string;
  title?: string | null;
  altText?: string | null;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
  source: VisualAssetSource;
  status: VisualAsset["status"];
  currentVersionId: string;
  versionCount: number;
  availableRepresentations: VisualRepresentation[];
  derived: Array<
    Pick<
      VisualDerivedInfo,
      "id" | "kind" | "status" | "confidence" | "version_id"
    >
  >;
}

export interface CreateVisualAnnotationInput {
  workspaceId: string;
  assetId: string;
  versionId?: string;
  type: VisualAnnotation["type"];
  geometry: VisualAnnotationGeometry;
  text?: string | null;
  confidence?: number | null;
  source?: VisualAnnotation["source"];
  annotationId?: string;
}

export interface CreateVisualRelationInput {
  workspaceId: string;
  relationType: VisualRelationType;
  sourceType: VisualEndpointType;
  sourceId: string;
  targetType: VisualEndpointType;
  targetId: string;
  sourceVersionId?: string | null;
  targetVersionId?: string | null;
  description?: string | null;
  relationId?: string;
}

export interface CreateVisualFlowDraftInput {
  workspaceId: string;
  target: VisualTarget;
  nodes: VisualFlowDraft["nodes"];
  edges?: VisualFlowDraft["edges"];
  confidence?: number | null;
  uncertainties?: string[];
  provenance?: Record<string, unknown> | null;
  requestId?: string | null;
  draftId?: string;
}

function clone<T>(value: T): T {
  if (value instanceof Uint8Array) return value.slice() as T;
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        clone(item),
      ]),
    ) as T;
  }
  return value;
}

function noVersionBytes(version: VisualAssetVersion): VisualAssetVersion {
  const { data: _data, ...metadata } = version;
  return metadata;
}

function sameWorkspaceAsset(
  asset: VisualAsset,
  workspaceId: string,
  nodes: WorkspaceNode[],
): boolean {
  return (
    // A null workspace is an account-owned personal-library asset. It may be
    // mounted into more than one workspace through an image node.
    asset.workspace_id == null ||
    asset.workspace_id === workspaceId ||
    nodes.some(
      (node) =>
        node.workspace_id === workspaceId &&
        node.kind === "image" &&
        node.entity_type === "visual_asset" &&
        node.entity_id === asset.id,
    )
  );
}

function assertCoordinate(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new VisualServiceError(
      "invalid_input",
      `${label} must be a normalized coordinate between 0 and 1.`,
      { label, value },
    );
  }
}

/**
 * Shared visual domain seam. UI, MCP and Guest/Cloud adapters call this
 * service; the service owns validation, target resolution, versioning and
 * non-destructive writes while the adapter owns persistence.
 */
export class VisualWorkspaceService {
  readonly store: VisualAssetStore;
  readonly userId: string;
  readonly limits: VisualAssetLimits;
  private readonly now: () => string;
  private readonly idFactory: (prefix: string) => string;
  private readonly nodeContext: VisualServiceNodeContext;
  private readonly commitFlow?: VisualWorkspaceServiceOptions["commitFlow"];
  private readonly rollbackFlow?: VisualWorkspaceServiceOptions["rollbackFlow"];
  private readonly renderVisual?: VisualWorkspaceServiceOptions["renderVisual"];

  constructor(store: VisualAssetStore, options: VisualWorkspaceServiceOptions) {
    this.store = store;
    this.userId = options.userId;
    this.limits = { ...DEFAULT_VISUAL_ASSET_LIMITS, ...(options.limits ?? {}) };
    this.now = options.now ?? (() => new Date().toISOString());
    // Cloud visual tables use UUID primary keys. Guest stores accept opaque
    // strings too, so a bare UUID keeps both adapters on the same identifier
    // contract while still allowing deterministic test/MCP factories.
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
    this.nodeContext = options;
    this.commitFlow = options.commitFlow;
    this.rollbackFlow = options.rollbackFlow;
    this.renderVisual = options.renderVisual;
  }

  private id(prefix: string): string {
    return this.idFactory(prefix);
  }

  private async assertWorkspace(workspaceId: string): Promise<void> {
    if (!workspaceId.trim()) {
      throw new VisualServiceError("invalid_input", "workspaceId is required.");
    }
    if (this.nodeContext.getWorkspace) {
      const workspace = await this.nodeContext.getWorkspace(workspaceId);
      if (!workspace) {
        throw new VisualServiceError(
          "workspace_not_found",
          `Workspace "${workspaceId}" was not found.`,
          { workspaceId },
        );
      }
      if (workspace.user_id && workspace.user_id !== this.userId) {
        throw new VisualServiceError(
          "authorization",
          `Workspace "${workspaceId}" belongs to another Account.`,
          { workspaceId },
        );
      }
    }
  }

  private async nodes(workspaceId: string): Promise<WorkspaceNode[]> {
    return this.nodeContext.listNodes
      ? await this.nodeContext.listNodes(workspaceId)
      : [];
  }

  private assertAssetOwnership(asset: VisualAsset): void {
    if (asset.user_id && asset.user_id !== this.userId) {
      throw new VisualServiceError(
        "authorization",
        `Visual asset "${asset.id}" belongs to another Account.`,
        { assetId: asset.id },
      );
    }
  }

  private async validated(
    input: VisualBytes,
    mimeType?: string,
  ): Promise<ValidatedVisualBytes> {
    try {
      return await validateVisualBytes(input, mimeType, this.limits);
    } catch (error) {
      if (error instanceof VisualValidationError) throw error;
      throw new VisualServiceError(
        "execution",
        "Visual asset validation failed.",
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
  }

  async ingest(input: CreateVisualAssetInput): Promise<CreatedVisualAsset> {
    await this.assertWorkspace(input.workspaceId);
    const inspected = await this.validated(input.bytes, input.mimeType);
    const existingAssets = await this.store.listAssets(input.workspaceId);
    const deduplicate = input.deduplicate ?? true;
    if (!input.assetId && deduplicate) {
      const matching = existingAssets.find(
        (asset) =>
          asset.sha256 === inspected.sha256 &&
          asset.mime_type === inspected.mimeType &&
          asset.status === "active",
      );
      if (matching) {
        const version = await this.store.getVersion(
          matching.id,
          matching.current_version_id,
        );
        if (version) {
          return {
            asset: matching,
            version: noVersionBytes(version),
            reused: true,
          };
        }
      }
    }

    if (existingAssets.length >= this.limits.maxWorkspaceAssets) {
      throw new VisualServiceError(
        "quota_exceeded",
        "This Workspace has reached its visual asset limit.",
        {
          workspaceId: input.workspaceId,
          maxWorkspaceAssets: this.limits.maxWorkspaceAssets,
        },
      );
    }

    const timestamp = this.now();
    const assetId = input.assetId ?? this.id("asset");
    const versionId = input.versionId ?? this.id("asset-version");
    const version: VisualAssetVersion = {
      id: versionId,
      asset_id: assetId,
      user_id: this.userId,
      version_number: 1,
      mime_type: inspected.mimeType,
      byte_size: inspected.bytes.length,
      width: inspected.width,
      height: inspected.height,
      sha256: inspected.sha256,
      storage_key: `${this.userId}/${assetId}/${versionId}`,
      source: input.source ?? "upload",
      source_uri: input.sourceUri ?? null,
      source_asset_id: null,
      replaced_version_id: null,
      created_by: this.userId,
      created_at: timestamp,
    };
    const asset: VisualAsset = {
      id: assetId,
      user_id: this.userId,
      workspace_id: input.workspaceId,
      current_version_id: versionId,
      mime_type: inspected.mimeType,
      byte_size: inspected.bytes.length,
      width: inspected.width,
      height: inspected.height,
      sha256: inspected.sha256,
      source: input.source ?? "upload",
      source_uri: input.sourceUri ?? null,
      title: input.title ?? null,
      alt_text: input.altText ?? null,
      status: "active",
      version_count: 1,
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
      metadata: input.metadata ?? null,
    };
    try {
      const saved = await this.store.createAsset({
        asset,
        version,
        bytes: inspected.bytes,
      });
      return { asset: saved, version: noVersionBytes(version), reused: false };
    } catch (error) {
      // The adapter's create operation is atomic. A failed commit therefore
      // cannot leave a node or an untracked temporary version behind.
      if (error instanceof VisualServiceError) throw error;
      throw new VisualServiceError(
        "execution",
        "The visual asset could not be saved; no Workspace node was created.",
        {
          assetId,
          versionId,
          cause: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  async createAsset(
    input: CreateVisualAssetInput,
  ): Promise<CreatedVisualAsset> {
    return this.ingest(input);
  }

  async readVersion(assetId: string, versionId?: string): Promise<Uint8Array> {
    const asset = await this.store.getAsset(assetId);
    if (!asset) {
      throw new VisualServiceError(
        "asset_not_found",
        `Visual asset "${assetId}" was not found.`,
        { assetId },
      );
    }
    this.assertAssetOwnership(asset);
    try {
      return await this.store.readVersion(
        assetId,
        versionId ?? asset.current_version_id,
      );
    } catch (error) {
      throw new VisualServiceError(
        "execution",
        `Visual asset "${assetId}" is not readable.`,
        {
          assetId,
          versionId: versionId ?? asset.current_version_id,
          cause: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  async resolveTarget(target: VisualTarget): Promise<{
    asset: VisualAsset;
    node?: WorkspaceNode;
  }> {
    const hasExplicitTarget = Boolean(
      target.nodeId || target.assetId || target.resourceId || target.title,
    );
    if (!hasExplicitTarget) {
      throw new VisualServiceError(
        "invalid_input",
        "An explicit nodeId, assetId, resourceId, or unique title is required; canvas selection is not used.",
      );
    }
    const parsedResource = target.resourceId?.match(
      /^(?:visual:\/\/assets\/|asset:|kagelin:\/\/assets\/)([^/?#]+)$/i,
    )?.[1];
    const resourceWorkspace = target.resourceId?.match(
      /^kagelin:\/\/workspaces\/([^/]+)\/(?:assets|visual-assets)\/([^/?#]+)$/i,
    );
    const assetId = target.assetId ?? parsedResource ?? resourceWorkspace?.[2];
    const workspaceId = target.workspaceId ?? resourceWorkspace?.[1];
    if (
      (target.assetId || parsedResource || resourceWorkspace?.[2]) &&
      !assetId
    ) {
      throw new VisualServiceError(
        "invalid_input",
        "The visual resource ID is invalid.",
      );
    }
    if (
      resourceWorkspace &&
      target.workspaceId &&
      target.workspaceId !== resourceWorkspace[1]
    ) {
      throw new VisualServiceError(
        "invalid_input",
        "The visual resource and workspace IDs do not match.",
      );
    }
    if (workspaceId) await this.assertWorkspace(workspaceId);

    let node: WorkspaceNode | undefined;
    if (target.nodeId) {
      if (!workspaceId) {
        throw new VisualServiceError(
          "invalid_input",
          "workspaceId is required when resolving a nodeId.",
        );
      }
      const workspaceNodes = await this.nodes(workspaceId);
      node = workspaceNodes.find((item) => item.id === target.nodeId);
      if (!node) {
        throw new VisualServiceError(
          "target_not_found",
          `Image node "${target.nodeId}" was not found in the Workspace.`,
          { workspaceId, nodeId: target.nodeId },
        );
      }
      if (
        node.kind !== "image" ||
        node.entity_type !== "visual_asset" ||
        !node.entity_id
      ) {
        throw new VisualServiceError(
          "invalid_input",
          `Node "${target.nodeId}" is not an image node.`,
          { nodeId: target.nodeId },
        );
      }
      if (node.user_id && node.user_id !== this.userId) {
        throw new VisualServiceError(
          "authorization",
          `Image node "${target.nodeId}" belongs to another Account.`,
          { nodeId: target.nodeId },
        );
      }
      if (assetId && assetId !== node.entity_id) {
        throw new VisualServiceError(
          "invalid_input",
          "The node and asset targets do not match.",
          { nodeId: node.id, assetId, nodeAssetId: node.entity_id },
        );
      }
    }

    if (!node && target.title) {
      if (!workspaceId) {
        throw new VisualServiceError(
          "invalid_input",
          "workspaceId is required when resolving a title.",
        );
      }
      const workspaceNodes = await this.nodes(workspaceId);
      const needle = target.title.trim().toLocaleLowerCase();
      const matches = workspaceNodes.filter((item) => {
        if (
          item.kind !== "image" ||
          item.entity_type !== "visual_asset" ||
          !item.entity_id
        )
          return false;
        const display = (item.display_config ?? {}) as Record<string, unknown>;
        return (
          String(display.title ?? "")
            .trim()
            .toLocaleLowerCase() === needle
        );
      });
      if (matches.length === 0) {
        throw new VisualServiceError(
          "target_not_found",
          `No image node named "${target.title}" was found.`,
          { workspaceId, title: target.title },
        );
      }
      if (matches.length > 1) {
        throw new VisualServiceError(
          "target_ambiguous",
          `More than one image node is named "${target.title}"; provide nodeId or assetId.`,
          {
            workspaceId,
            title: target.title,
            nodeIds: matches.map((item) => item.id),
          },
        );
      }
      node = matches[0];
      if (node.user_id && node.user_id !== this.userId) {
        throw new VisualServiceError(
          "authorization",
          `Image node "${node.id}" belongs to another Account.`,
          { nodeId: node.id },
        );
      }
      if (assetId && assetId !== node.entity_id) {
        throw new VisualServiceError(
          "invalid_input",
          "The title and asset targets do not match.",
          { assetId, nodeAssetId: node.entity_id },
        );
      }
    }

    const resolvedAssetId = assetId ?? node?.entity_id;
    if (!resolvedAssetId) {
      throw new VisualServiceError(
        "invalid_input",
        "A visual asset target could not be resolved.",
      );
    }
    const asset = await this.store.getAsset(resolvedAssetId);
    if (!asset) {
      throw new VisualServiceError(
        "target_not_found",
        `Visual asset "${resolvedAssetId}" was not found.`,
        { assetId: resolvedAssetId },
      );
    }
    this.assertAssetOwnership(asset);
    if (workspaceId) {
      const workspaceNodes = node ? [node] : await this.nodes(workspaceId);
      if (!sameWorkspaceAsset(asset, workspaceId, workspaceNodes)) {
        throw new VisualServiceError(
          "authorization",
          `Visual asset "${resolvedAssetId}" is not in Workspace "${workspaceId}".`,
          { assetId: resolvedAssetId, workspaceId },
        );
      }
    }
    return { asset, node };
  }

  async describeVisual(target: VisualTarget): Promise<VisualDescriptor> {
    const resolved = await this.resolveTarget(target);
    const derived = await this.store.listDerived(
      resolved.asset.id,
      resolved.asset.current_version_id,
    );
    return {
      assetId: resolved.asset.id,
      workspaceId: resolved.asset.workspace_id,
      nodeId: resolved.node?.id,
      title: resolved.node
        ? String(
            (resolved.node.display_config ?? {}).title ??
              resolved.asset.title ??
              "",
          ) || null
        : resolved.asset.title,
      altText: resolved.asset.alt_text,
      mimeType: resolved.asset.mime_type,
      byteSize: resolved.asset.byte_size,
      width: resolved.asset.width,
      height: resolved.asset.height,
      sha256: resolved.asset.sha256,
      source: resolved.asset.source,
      status: resolved.asset.status,
      currentVersionId: resolved.asset.current_version_id,
      versionCount: resolved.asset.version_count,
      availableRepresentations: ["thumbnail", "crop", "original"],
      derived: derived.map((item) => ({
        id: item.id,
        kind: item.kind,
        status: item.status,
        confidence: item.confidence,
        version_id: item.version_id,
      })),
    };
  }

  async inspectVisual(
    target: VisualTarget,
    options: InspectVisualOptions = {},
  ): Promise<VisualInspection> {
    const resolved = await this.resolveTarget(target);
    const expected = options.expectedVersionId;
    if (expected && expected !== resolved.asset.current_version_id) {
      throw new VisualServiceError(
        "version_conflict",
        "The visual asset changed since the caller last inspected it.",
        {
          assetId: resolved.asset.id,
          expectedVersionId: expected,
          currentVersionId: resolved.asset.current_version_id,
        },
      );
    }
    const versionId = options.versionId ?? resolved.asset.current_version_id;
    const version = await this.store.getVersion(resolved.asset.id, versionId);
    if (!version) {
      throw new VisualServiceError(
        "target_not_found",
        `Visual asset version "${versionId}" was not found.`,
        { assetId: resolved.asset.id, versionId },
      );
    }
    const representation = options.representation ?? "thumbnail";
    if (representation === "crop" && !options.crop) {
      throw new VisualServiceError(
        "invalid_input",
        "A crop rectangle is required for crop representation.",
      );
    }
    let crop: VisualCrop | undefined;
    if (options.crop) crop = this.normaliseCrop(options.crop, version);
    const originalBytes = await this.readVersion(resolved.asset.id, version.id);
    const rendered =
      representation !== "original" && this.renderVisual
        ? await this.renderVisual({
            bytes: originalBytes,
            mimeType: version.mime_type,
            representation,
            crop,
            width: version.width,
            height: version.height,
          })
        : { bytes: originalBytes, mimeType: version.mime_type };
    const bytes = rendered.bytes;
    // The caller can request a smaller response budget, but never enlarge
    // the server/account ceiling through a tool argument.
    const maxResponseBytes = Math.min(
      options.maxResponseBytes ?? this.limits.maxBytes,
      this.limits.maxBytes,
    );
    if (bytes.length > maxResponseBytes) {
      throw new VisualServiceError(
        "resource_too_large",
        "The requested visual representation exceeds the response budget; request a crop or a smaller client budget.",
        {
          assetId: resolved.asset.id,
          versionId: version.id,
          byteSize: bytes.length,
          maxResponseBytes,
          representation,
        },
      );
    }
    return {
      asset: clone(resolved.asset),
      version: noVersionBytes(version),
      representation,
      ...(crop ? { crop } : {}),
      bytes,
      responseMimeType: rendered.mimeType ?? version.mime_type,
      transformed: rendered.bytes !== originalBytes,
    };
  }

  private normaliseCrop(
    crop: VisualCrop,
    version: VisualAssetVersion,
  ): VisualCrop {
    const coordinateSpace = crop.coordinateSpace ?? "normalized";
    const normalised =
      coordinateSpace === "pixels"
        ? {
            x: crop.x / version.width,
            y: crop.y / version.height,
            width: crop.width / version.width,
            height: crop.height / version.height,
          }
        : { x: crop.x, y: crop.y, width: crop.width, height: crop.height };
    assertCoordinate(normalised.x, "crop.x");
    assertCoordinate(normalised.y, "crop.y");
    if (
      !Number.isFinite(normalised.width) ||
      !Number.isFinite(normalised.height) ||
      normalised.width <= 0 ||
      normalised.height <= 0 ||
      normalised.x + normalised.width > 1 ||
      normalised.y + normalised.height > 1
    ) {
      throw new VisualServiceError(
        "invalid_input",
        "The crop rectangle must stay within the image bounds.",
        { crop },
      );
    }
    return { ...normalised, coordinateSpace: "normalized" };
  }

  async updateMetadata(
    assetId: string,
    patch: VisualMetadataPatch,
    expectedVersionId?: string,
  ): Promise<VisualAsset> {
    const asset = await this.store.getAsset(assetId);
    if (!asset)
      throw new VisualServiceError(
        "asset_not_found",
        `Visual asset "${assetId}" was not found.`,
        { assetId },
      );
    this.assertAssetOwnership(asset);
    if (expectedVersionId && expectedVersionId !== asset.current_version_id) {
      throw new VisualServiceError(
        "version_conflict",
        "The visual asset changed before metadata could be saved.",
        {
          assetId,
          expectedVersionId,
          currentVersionId: asset.current_version_id,
        },
      );
    }
    const updated: VisualAsset = {
      ...asset,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.altText !== undefined ? { alt_text: patch.altText } : {}),
      ...(patch.sourceUri !== undefined ? { source_uri: patch.sourceUri } : {}),
      ...(patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
      updated_at: this.now(),
    };
    return this.store.updateAsset(updated);
  }

  private async lifecycleAsset(assetId: string): Promise<VisualAsset | null> {
    return this.store.getAssetIncludingDeleted
      ? this.store.getAssetIncludingDeleted(assetId)
      : this.store.getAsset(assetId);
  }

  async deleteAsset(
    assetId: string,
    confirmed: boolean,
    expectedVersionId?: string,
  ): Promise<VisualAsset> {
    const asset = await this.lifecycleAsset(assetId);
    if (!asset) {
      throw new VisualServiceError(
        "asset_not_found",
        `Visual asset "${assetId}" was not found.`,
        { assetId },
      );
    }
    this.assertAssetOwnership(asset);
    if (!confirmed) {
      throw new VisualServiceError(
        "confirmation_required",
        "Deleting a visual asset is destructive and requires confirmed: true.",
        { assetId },
      );
    }
    if (expectedVersionId && expectedVersionId !== asset.current_version_id) {
      throw new VisualServiceError(
        "version_conflict",
        "The visual asset changed before deletion could be recorded.",
        {
          assetId,
          expectedVersionId,
          currentVersionId: asset.current_version_id,
        },
      );
    }
    const deleted: VisualAsset = {
      ...asset,
      status: "deleted",
      deleted_at: this.now(),
      updated_at: this.now(),
    };
    return this.store.updateAsset(deleted);
  }

  async restoreAsset(assetId: string): Promise<VisualAsset> {
    const asset = await this.lifecycleAsset(assetId);
    if (!asset) {
      throw new VisualServiceError(
        "asset_not_found",
        `Visual asset "${assetId}" was not found.`,
        { assetId },
      );
    }
    if (asset.user_id && asset.user_id !== this.userId) {
      throw new VisualServiceError(
        "authorization",
        "The visual asset is not owned by the active Account.",
        { assetId },
      );
    }
    if (asset.status !== "deleted") return asset;
    return this.store.updateAsset({
      ...asset,
      status: "active",
      deleted_at: null,
      updated_at: this.now(),
    });
  }

  async replaceVersion(
    input: ReplaceVisualAssetInput,
  ): Promise<{ asset: VisualAsset; version: VisualAssetVersion }> {
    const current = await this.store.getAsset(input.assetId);
    if (!current)
      throw new VisualServiceError(
        "asset_not_found",
        `Visual asset "${input.assetId}" was not found.`,
        { assetId: input.assetId },
      );
    this.assertAssetOwnership(current);
    if (
      input.expectedVersionId &&
      input.expectedVersionId !== current.current_version_id
    ) {
      throw new VisualServiceError(
        "version_conflict",
        "The visual asset changed before replacement could be saved.",
        {
          assetId: input.assetId,
          expectedVersionId: input.expectedVersionId,
          currentVersionId: current.current_version_id,
        },
      );
    }
    const inspected = await this.validated(input.bytes, input.mimeType);
    const oldVersion = await this.store.getVersion(
      input.assetId,
      current.current_version_id,
    );
    if (!oldVersion)
      throw new VisualServiceError(
        "execution",
        "The current visual asset version is missing.",
        { assetId: input.assetId },
      );
    const timestamp = this.now();
    const versionId = input.versionId ?? this.id("asset-version");
    const version: VisualAssetVersion = {
      id: versionId,
      asset_id: input.assetId,
      user_id: this.userId,
      version_number: oldVersion.version_number + 1,
      mime_type: inspected.mimeType,
      byte_size: inspected.bytes.length,
      width: inspected.width,
      height: inspected.height,
      sha256: inspected.sha256,
      storage_key: `${this.userId}/${input.assetId}/${versionId}`,
      source: input.source ?? "upload",
      source_uri: input.sourceUri ?? null,
      source_asset_id: input.sourceAssetId ?? null,
      replaced_version_id: oldVersion.id,
      created_by: this.userId,
      created_at: timestamp,
    };
    const updatedAsset: VisualAsset = {
      ...current,
      current_version_id: version.id,
      mime_type: version.mime_type,
      byte_size: version.byte_size,
      width: version.width,
      height: version.height,
      sha256: version.sha256,
      source: version.source,
      source_uri: version.source_uri,
      version_count: current.version_count + 1,
      updated_at: timestamp,
    };
    const saved = await this.store.appendVersion({
      asset: updatedAsset,
      version,
      bytes: inspected.bytes,
    });
    const derived = await this.store.listDerived(input.assetId, oldVersion.id);
    for (const item of derived)
      await this.store.putDerived({
        ...item,
        status: "stale",
        updated_at: timestamp,
      });
    return { asset: saved, version: noVersionBytes(version) };
  }

  async addAnnotation(
    input: CreateVisualAnnotationInput,
  ): Promise<VisualAnnotation> {
    const asset = await this.store.getAsset(input.assetId);
    if (!asset)
      throw new VisualServiceError(
        "asset_not_found",
        `Visual asset "${input.assetId}" was not found.`,
        { assetId: input.assetId },
      );
    this.assertAssetOwnership(asset);
    await this.assertWorkspace(input.workspaceId);
    if (
      !sameWorkspaceAsset(
        asset,
        input.workspaceId,
        await this.nodes(input.workspaceId),
      )
    ) {
      throw new VisualServiceError(
        "authorization",
        `Visual asset "${input.assetId}" is not in Workspace "${input.workspaceId}".`,
        { assetId: input.assetId, workspaceId: input.workspaceId },
      );
    }
    const versionId = input.versionId ?? asset.current_version_id;
    const version = await this.store.getVersion(input.assetId, versionId);
    if (!version)
      throw new VisualServiceError(
        "target_not_found",
        "The annotation version was not found.",
        { assetId: input.assetId, versionId },
      );
    if (!VISUAL_ANNOTATION_TYPES.includes(input.type)) {
      throw new VisualServiceError(
        "invalid_input",
        `Annotation type "${String(input.type)}" is not supported.`,
        { type: input.type },
      );
    }
    if (
      input.confidence !== undefined &&
      input.confidence !== null &&
      (!Number.isFinite(input.confidence) ||
        input.confidence < 0 ||
        input.confidence > 1)
    ) {
      throw new VisualServiceError(
        "invalid_input",
        "Annotation confidence must be between 0 and 1.",
        { confidence: input.confidence },
      );
    }
    const existing = await this.store.listAnnotations(input.assetId);
    if (existing.length >= this.limits.maxAnnotationsPerAsset)
      throw new VisualServiceError(
        "quota_exceeded",
        "This visual asset has reached its annotation limit.",
        { assetId: input.assetId },
      );
    if (!input.geometry || typeof input.geometry !== "object") {
      throw new VisualServiceError(
        "invalid_input",
        "Annotation geometry is required.",
      );
    }
    const geometry = clone(input.geometry);
    if (typeof geometry.x !== "number" || typeof geometry.y !== "number") {
      throw new VisualServiceError(
        "invalid_input",
        "Annotation geometry requires numeric x and y coordinates.",
        { geometry },
      );
    }
    assertCoordinate(geometry.x, "annotation.geometry.x");
    assertCoordinate(geometry.y, "annotation.geometry.y");
    if (geometry.width !== undefined) {
      if (typeof geometry.width !== "number") {
        throw new VisualServiceError(
          "invalid_input",
          "Annotation geometry width must be numeric.",
          { geometry },
        );
      }
      assertCoordinate(geometry.width, "annotation.geometry.width");
    }
    if (geometry.height !== undefined) {
      if (typeof geometry.height !== "number") {
        throw new VisualServiceError(
          "invalid_input",
          "Annotation geometry height must be numeric.",
          { geometry },
        );
      }
      assertCoordinate(geometry.height, "annotation.geometry.height");
    }
    if (geometry.width !== undefined && geometry.x + geometry.width > 1) {
      throw new VisualServiceError(
        "invalid_input",
        "annotation.geometry must stay within the image bounds.",
        { geometry },
      );
    }
    if (geometry.height !== undefined && geometry.y + geometry.height > 1) {
      throw new VisualServiceError(
        "invalid_input",
        "annotation.geometry must stay within the image bounds.",
        { geometry },
      );
    }
    if (geometry.points !== undefined) {
      if (!Array.isArray(geometry.points)) {
        throw new VisualServiceError(
          "invalid_input",
          "Annotation geometry points must be an array.",
          { geometry },
        );
      }
      geometry.points.forEach((point, index) => {
        if (
          !point ||
          typeof point.x !== "number" ||
          typeof point.y !== "number"
        ) {
          throw new VisualServiceError(
            "invalid_input",
            "Annotation geometry points require numeric x and y coordinates.",
            { index, point },
          );
        }
        assertCoordinate(point.x, `annotation.geometry.points[${index}].x`);
        assertCoordinate(point.y, `annotation.geometry.points[${index}].y`);
      });
    }
    const annotation: VisualAnnotation = {
      id: input.annotationId ?? this.id("annotation"),
      workspace_id: input.workspaceId,
      asset_id: input.assetId,
      version_id: version.id,
      type: input.type,
      geometry,
      text: input.text ?? null,
      confidence: input.confidence ?? null,
      source: input.source ?? "ai",
      created_by: this.userId,
      created_at: this.now(),
      updated_at: this.now(),
    };
    return this.store.putAnnotation(annotation);
  }

  async listAnnotations(
    assetId: string,
    versionId?: string,
  ): Promise<VisualAnnotation[]> {
    const asset = await this.store.getAsset(assetId);
    if (!asset)
      throw new VisualServiceError(
        "asset_not_found",
        `Visual asset "${assetId}" was not found.`,
        { assetId },
      );
    this.assertAssetOwnership(asset);
    return this.store.listAnnotations(assetId, versionId);
  }

  async putDerived(
    input: Omit<VisualDerivedInfo, "created_at" | "updated_at" | "id"> & {
      id?: string;
    },
  ): Promise<VisualDerivedInfo> {
    const asset = await this.store.getAsset(input.asset_id);
    if (!asset)
      throw new VisualServiceError(
        "asset_not_found",
        "The derived visual asset was not found.",
        { assetId: input.asset_id },
      );
    this.assertAssetOwnership(asset);
    const version = await this.store.getVersion(
      input.asset_id,
      input.version_id,
    );
    if (!version)
      throw new VisualServiceError(
        "target_not_found",
        "The derived visual version was not found.",
        { assetId: input.asset_id, versionId: input.version_id },
      );
    const timestamp = this.now();
    return this.store.putDerived({
      ...input,
      id: input.id ?? this.id("derived"),
      created_at: timestamp,
      updated_at: timestamp,
    });
  }

  private async assertEndpoint(
    workspaceId: string,
    type: VisualEndpointType,
    id: string,
  ): Promise<{ assetId?: string; versionId?: string }> {
    const workspaceNodes = await this.nodes(workspaceId);
    if (type === "visual_asset") {
      const asset = await this.store.getAsset(id);
      if (!asset || !sameWorkspaceAsset(asset, workspaceId, workspaceNodes))
        throw new VisualServiceError(
          "relation_invalid",
          "The visual asset endpoint is not in the target Workspace.",
          { type, id, workspaceId },
        );
      this.assertAssetOwnership(asset);
      return { assetId: asset.id, versionId: asset.current_version_id };
    }
    const node = workspaceNodes.find((item) => item.id === id);
    if (!node)
      throw new VisualServiceError(
        "relation_invalid",
        `Endpoint "${id}" is not in the target Workspace.`,
        { type, id, workspaceId },
      );
    if (type === "image_node" && node.kind !== "image")
      throw new VisualServiceError(
        "relation_invalid",
        "The endpoint is not an image node.",
        { type, id },
      );
    if (
      type !== "image_node" &&
      type !== "workspace_node" &&
      node.kind !== type
    )
      throw new VisualServiceError(
        "relation_invalid",
        `Endpoint "${id}" is not a ${type} node.`,
        { type, id, actualKind: node.kind },
      );
    if (node.user_id && node.user_id !== this.userId)
      throw new VisualServiceError(
        "authorization",
        "The visual relation endpoint is not owned by the active Account.",
        { type, id },
      );
    if (node.kind !== "image" || !node.entity_id) return {};
    const asset = await this.store.getAsset(node.entity_id);
    if (!asset) {
      throw new VisualServiceError(
        "relation_invalid",
        `Image node "${node.id}" references an unavailable visual asset.`,
        { type, id, assetId: node.entity_id },
      );
    }
    this.assertAssetOwnership(asset);
    return { assetId: asset.id, versionId: asset.current_version_id };
  }

  private async resolveRelationVersion(
    endpoint: { assetId?: string; versionId?: string },
    requestedVersionId: string | null | undefined,
    endpointLabel: string,
  ): Promise<string | null> {
    if (requestedVersionId == null) return endpoint.versionId ?? null;
    if (!endpoint.assetId) {
      throw new VisualServiceError(
        "relation_invalid",
        `${endpointLabel} version IDs are only valid for visual asset or image-node endpoints.`,
        { versionId: requestedVersionId },
      );
    }
    const version = await this.store.getVersion(
      endpoint.assetId,
      requestedVersionId,
    );
    if (!version) {
      throw new VisualServiceError(
        "relation_invalid",
        `${endpointLabel} version "${requestedVersionId}" was not found for the endpoint asset.`,
        { assetId: endpoint.assetId, versionId: requestedVersionId },
      );
    }
    return version.id;
  }

  async createRelation(
    input: CreateVisualRelationInput,
  ): Promise<VisualRelation> {
    await this.assertWorkspace(input.workspaceId);
    const source = await this.assertEndpoint(
      input.workspaceId,
      input.sourceType,
      input.sourceId,
    );
    const target = await this.assertEndpoint(
      input.workspaceId,
      input.targetType,
      input.targetId,
    );
    if (
      input.sourceType === "visual_asset" &&
      input.sourceId === input.targetId &&
      input.targetType === "visual_asset"
    )
      throw new VisualServiceError(
        "relation_invalid",
        "A visual relation cannot point an asset to itself.",
      );
    const sourceVersionId = await this.resolveRelationVersion(
      source,
      input.sourceVersionId,
      "Source",
    );
    const targetVersionId = await this.resolveRelationVersion(
      target,
      input.targetVersionId,
      "Target",
    );
    const relation: VisualRelation = {
      id: input.relationId ?? this.id("visual-relation"),
      workspace_id: input.workspaceId,
      user_id: this.userId,
      relation_type: input.relationType,
      source_type: input.sourceType,
      source_id: input.sourceId,
      target_type: input.targetType,
      target_id: input.targetId,
      source_version_id: sourceVersionId,
      target_version_id: targetVersionId,
      description: input.description ?? null,
      created_by: this.userId,
      created_at: this.now(),
      updated_at: this.now(),
    };
    return this.store.putRelation(relation);
  }

  async updateRelation(
    input: Omit<CreateVisualRelationInput, "relationId"> & {
      relationId: string;
      expectedUpdatedAt?: string;
    },
  ): Promise<VisualRelation> {
    await this.assertWorkspace(input.workspaceId);
    const existing = (await this.store.listRelations(input.workspaceId)).find(
      (relation) => relation.id === input.relationId,
    );
    if (!existing) {
      throw new VisualServiceError(
        "target_not_found",
        `Visual relation "${input.relationId}" was not found.`,
        { relationId: input.relationId, workspaceId: input.workspaceId },
      );
    }
    if (
      input.expectedUpdatedAt &&
      input.expectedUpdatedAt !== existing.updated_at
    ) {
      throw new VisualServiceError(
        "version_conflict",
        "The visual relation changed before it could be updated.",
        {
          relationId: input.relationId,
          expectedUpdatedAt: input.expectedUpdatedAt,
          currentUpdatedAt: existing.updated_at,
        },
      );
    }
    const source = await this.assertEndpoint(
      input.workspaceId,
      input.sourceType,
      input.sourceId,
    );
    const target = await this.assertEndpoint(
      input.workspaceId,
      input.targetType,
      input.targetId,
    );
    if (
      input.sourceType === "visual_asset" &&
      input.sourceId === input.targetId &&
      input.targetType === "visual_asset"
    ) {
      throw new VisualServiceError(
        "relation_invalid",
        "A visual relation cannot point an asset to itself.",
      );
    }
    const sourceVersionId = await this.resolveRelationVersion(
      source,
      input.sourceVersionId,
      "Source",
    );
    const targetVersionId = await this.resolveRelationVersion(
      target,
      input.targetVersionId,
      "Target",
    );
    return this.store.putRelation({
      ...existing,
      relation_type: input.relationType,
      source_type: input.sourceType,
      source_id: input.sourceId,
      target_type: input.targetType,
      target_id: input.targetId,
      source_version_id: sourceVersionId,
      target_version_id: targetVersionId,
      description: input.description ?? null,
      updated_at: this.now(),
    });
  }

  async listRelations(workspaceId: string): Promise<VisualRelation[]> {
    await this.assertWorkspace(workspaceId);
    return (await this.store.listRelations(workspaceId)).filter(
      (relation) => !relation.user_id || relation.user_id === this.userId,
    );
  }

  async removeRelation(workspaceId: string, relationId: string): Promise<void> {
    await this.assertWorkspace(workspaceId);
    const relation = (await this.listRelations(workspaceId)).find(
      (item) => item.id === relationId,
    );
    if (!relation)
      throw new VisualServiceError(
        "target_not_found",
        `Visual relation "${relationId}" was not found.`,
        { relationId, workspaceId },
      );
    await this.store.removeRelation(relationId);
  }

  async createFlowDraft(
    input: CreateVisualFlowDraftInput,
  ): Promise<VisualFlowDraft> {
    await this.assertWorkspace(input.workspaceId);
    const resolved = await this.resolveTarget({
      ...input.target,
      workspaceId: input.workspaceId,
    });
    if (
      input.nodes.some(
        (node) => !node.id || !["step", "decision"].includes(node.kind),
      )
    )
      throw new VisualServiceError(
        "invalid_input",
        "Flow drafts may contain only step and decision nodes with IDs.",
      );
    const nodeIds = new Set(input.nodes.map((node) => node.id));
    if (nodeIds.size !== input.nodes.length) {
      throw new VisualServiceError(
        "invalid_input",
        "Flow draft node IDs must be unique.",
      );
    }
    const edgeIds = new Set<string>();
    for (const edge of input.edges ?? []) {
      if (!edge.id || edgeIds.has(edge.id)) {
        throw new VisualServiceError(
          "invalid_input",
          "Flow draft edge IDs must be unique.",
          { edgeId: edge.id },
        );
      }
      edgeIds.add(edge.id);
      if (
        edge.fromNodeId === edge.toNodeId ||
        !nodeIds.has(edge.fromNodeId) ||
        !nodeIds.has(edge.toNodeId)
      )
        throw new VisualServiceError(
          "invalid_input",
          "A flow draft edge must reference two distinct draft nodes.",
          { edgeId: edge.id },
        );
    }
    const timestamp = this.now();
    const draft: VisualFlowDraft = {
      id: input.draftId ?? this.id("visual-flow-draft"),
      workspace_id: input.workspaceId,
      source_asset_id: resolved.asset.id,
      source_node_id: resolved.node?.id ?? null,
      source_version_id: resolved.asset.current_version_id,
      status: "pending",
      nodes: clone(input.nodes),
      edges: clone(input.edges ?? []),
      confidence: input.confidence ?? null,
      uncertainties: [...(input.uncertainties ?? [])],
      provenance: input.provenance ?? null,
      created_by: this.userId,
      request_id: input.requestId ?? null,
      created_at: timestamp,
      updated_at: timestamp,
      confirmed_at: null,
    };
    return this.store.putDraft(draft);
  }

  async getDraft(draftId: string): Promise<VisualFlowDraft> {
    const draft = await this.store.getDraft(draftId);
    if (!draft)
      throw new VisualServiceError(
        "draft_not_found",
        `Visual flow draft "${draftId}" was not found.`,
        { draftId },
      );
    if (draft.created_by && draft.created_by !== this.userId) {
      throw new VisualServiceError(
        "authorization",
        `Visual flow draft "${draftId}" belongs to another Account.`,
        { draftId },
      );
    }
    await this.assertWorkspace(draft.workspace_id);
    const asset = await this.store.getAsset(draft.source_asset_id);
    if (!asset)
      throw new VisualServiceError(
        "target_not_found",
        "The visual flow draft source asset is unavailable.",
        { draftId, assetId: draft.source_asset_id },
      );
    this.assertAssetOwnership(asset);
    return draft;
  }

  async confirmFlowDraft(
    draftId: string,
    confirmed: boolean,
  ): Promise<{ draft: VisualFlowDraft; result?: VisualFlowCommitResult }> {
    const draft = await this.getDraft(draftId);
    if (!confirmed)
      throw new VisualServiceError(
        "confirmation_required",
        "Confirming a visual flow draft requires confirmed: true.",
        { draftId },
      );
    if (draft.status === "confirmed") return { draft };
    if (draft.status !== "pending")
      throw new VisualServiceError(
        "draft_stale",
        `Visual flow draft "${draftId}" is no longer pending.`,
        { draftId, status: draft.status },
      );
    const current = await this.store.getAsset(draft.source_asset_id);
    if (!current || current.current_version_id !== draft.source_version_id) {
      await this.store.putDraft({
        ...draft,
        status: "stale",
        updated_at: this.now(),
      });
      throw new VisualServiceError(
        "draft_stale",
        "The source image changed after this draft was created.",
        {
          draftId,
          sourceVersionId: draft.source_version_id,
          currentVersionId: current?.current_version_id,
        },
      );
    }
    if (!this.commitFlow)
      throw new VisualServiceError(
        "execution",
        "No Workspace command adapter is available to commit this draft.",
        { draftId },
      );
    const result = await this.commitFlow(draft);
    try {
      const confirmedDraft = {
        ...draft,
        status: "confirmed" as const,
        updated_at: this.now(),
        confirmed_at: this.now(),
      };
      await this.store.putDraft(confirmedDraft);
      for (const nodeId of result.createdNodeIds) {
        await this.createRelation({
          workspaceId: draft.workspace_id,
          relationType: "derived-from",
          sourceType: "workspace_node",
          sourceId: nodeId,
          targetType: "visual_asset",
          targetId: draft.source_asset_id,
          sourceVersionId: null,
          targetVersionId: draft.source_version_id,
        });
      }
      return { draft: confirmedDraft, result };
    } catch (error) {
      if (!this.rollbackFlow) {
        throw new VisualServiceError(
          "execution",
          "The visual flow was committed but provenance persistence failed; no rollback adapter is available.",
          {
            draftId,
            createdNodeIds: result.createdNodeIds,
            createdEdgeIds: result.createdEdgeIds,
            cause: error instanceof Error ? error.message : String(error),
          },
        );
      }
      try {
        await this.rollbackFlow(draft, result);
      } catch (rollbackError) {
        throw new VisualServiceError(
          "execution",
          "The visual flow was committed but provenance persistence failed and rollback was incomplete.",
          {
            draftId,
            createdNodeIds: result.createdNodeIds,
            createdEdgeIds: result.createdEdgeIds,
            cause: error instanceof Error ? error.message : String(error),
            rollbackError:
              rollbackError instanceof Error
                ? rollbackError.message
                : String(rollbackError),
          },
        );
      }
      throw new VisualServiceError(
        "execution",
        "The visual flow was not confirmed because its provenance could not be saved; native changes were rolled back.",
        {
          draftId,
          createdNodeIds: result.createdNodeIds,
          createdEdgeIds: result.createdEdgeIds,
          cause: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  async rejectFlowDraft(draftId: string): Promise<VisualFlowDraft> {
    const draft = await this.getDraft(draftId);
    if (draft.status === "confirmed")
      throw new VisualServiceError(
        "draft_stale",
        "A confirmed flow draft cannot be rejected.",
        { draftId },
      );
    return this.store.putDraft({
      ...draft,
      status: "rejected",
      updated_at: this.now(),
    });
  }
}

export function visualErrorToRecord(error: unknown): Record<string, unknown> {
  if (error instanceof VisualValidationError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  if (error instanceof VisualServiceError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  return {
    code: "execution",
    message: error instanceof Error ? error.message : String(error),
    details: {},
  };
}
