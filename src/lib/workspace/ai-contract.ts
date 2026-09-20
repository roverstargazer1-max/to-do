import { z } from "zod";
import { VisualServiceError, visualErrorToRecord } from "@/lib/visual/service";
import { VisualValidationError } from "@/lib/visual/validation";

/**
 * External Workspace AI contract versions.
 *
 * The MCP contract and the workflow Skill are intentionally versioned
 * independently.  A Skill may evolve its orchestration without changing the
 * Blueprint Engine or the MCP Workspace/Visual tool surface.
 */
export const WORKSPACE_MCP_CONTRACT_VERSION = "1.2.0" as const;
export const WORKSPACE_SKILL_VERSION = "1.0.0" as const;
export const WORKSPACE_MCP_SERVER_VERSION = "1.2.0" as const;

export const SUPPORTED_WORKSPACE_NODE_KINDS = [
  "doc",
  "task",
  "habit",
  "project",
  "focus",
  "decision",
  "step",
  "image",
] as const;

export type SupportedWorkspaceNodeKind =
  (typeof SUPPORTED_WORKSPACE_NODE_KINDS)[number];

export const WorkspaceErrorCategorySchema = z.enum([
  "authentication",
  "authorization",
  "invalid_input",
  "invalid_reference",
  "confirmation_required",
  "request_conflict",
  "execution",
  "compensation",
  "unsupported_operation",
]);

export type WorkspaceErrorCategory = z.infer<
  typeof WorkspaceErrorCategorySchema
>;

export class WorkspaceMcpError extends Error {
  readonly category: WorkspaceErrorCategory;
  readonly details: Record<string, unknown>;

  constructor(
    category: WorkspaceErrorCategory,
    message: string,
    details: Record<string, unknown> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "WorkspaceMcpError";
    this.category = category;
    this.details = details;
  }
}

export type WorkspaceOperationName = "build_workspace" | "patch_workspace";
export type WorkspaceOperationStatus = "succeeded" | "replayed" | "partial";

export interface LinkedEntityIds {
  tasks: string[];
  habits: string[];
  projects: string[];
}

export interface WorkspaceOperationCounts {
  nodes: number;
  edges: number;
  addedNodes: number;
  updatedNodes: number;
  removedNodes: number;
  addedConnections: number;
  removedConnections: number;
}

/**
 * Stable, deliberately row-sparse mutation result.  It is safe for clients
 * to persist this receipt and use the IDs in a later localized patch without
 * receiving unrestricted database rows.
 */
export interface WorkspaceOperationReceipt {
  success: true;
  contractVersion: typeof WORKSPACE_MCP_CONTRACT_VERSION;
  operation: WorkspaceOperationName;
  workspaceId: string;
  requestId?: string;
  status: WorkspaceOperationStatus;
  replayed: boolean;
  inputForm: "canonical" | "mermaid" | "legacy";
  itemNodeIds: Record<string, string>;
  linkedEntityIds: LinkedEntityIds;
  createdEntityIds: LinkedEntityIds;
  addedNodeIds: string[];
  updatedNodeIds: string[];
  removedNodeIds: string[];
  addedConnectionIds: string[];
  removedConnectionIds: string[];
  counts: WorkspaceOperationCounts;
  warnings: string[];
}

export interface WorkspaceMcpErrorPayload {
  success: false;
  contractVersion: typeof WORKSPACE_MCP_CONTRACT_VERSION;
  error: {
    category: WorkspaceErrorCategory;
    message: string;
    details: Record<string, unknown>;
  };
}

const SUPABASE_CONNECTIVITY_ERROR_MESSAGE =
  "MCP Server could not reach the configured Supabase endpoint.";

const SUPABASE_CONNECTIVITY_ERROR_HINT =
  "Check NEXT_PUBLIC_SUPABASE_URL, the Supabase/Docker services, and network connectivity.";

function isFetchFailure(value: unknown): boolean {
  return (
    typeof value === "string" && /(?:TypeError:\s*)?fetch failed/i.test(value)
  );
}

function connectivityErrorPayload(
  providerMessage: string,
  originalMessage?: string,
): WorkspaceMcpErrorPayload {
  return {
    success: false,
    contractVersion: WORKSPACE_MCP_CONTRACT_VERSION,
    error: {
      category: "execution",
      message: SUPABASE_CONNECTIVITY_ERROR_MESSAGE,
      details: {
        providerMessage,
        hint: SUPABASE_CONNECTIVITY_ERROR_HINT,
        ...(originalMessage && originalMessage !== providerMessage
          ? { operation: originalMessage }
          : {}),
      },
    },
  };
}

export function emptyLinkedEntityIds(): LinkedEntityIds {
  return { tasks: [], habits: [], projects: [] };
}

export function emptyOperationCounts(): WorkspaceOperationCounts {
  return {
    nodes: 0,
    edges: 0,
    addedNodes: 0,
    updatedNodes: 0,
    removedNodes: 0,
    addedConnections: 0,
    removedConnections: 0,
  };
}

export function isSupportedWorkspaceNodeKind(
  kind: string,
): kind is SupportedWorkspaceNodeKind {
  return (SUPPORTED_WORKSPACE_NODE_KINDS as readonly string[]).includes(kind);
}

/** JSON-safe stable ordering used by the process-local replay cache. */
export function canonicalizeForReplay(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .filter(([, item]) => item !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, normalize(item)]),
      );
    }
    return input;
  };

  return JSON.stringify(normalize(value));
}

export function toErrorPayload(err: unknown): WorkspaceMcpErrorPayload {
  if (
    err instanceof VisualServiceError ||
    err instanceof VisualValidationError
  ) {
    const visual = visualErrorToRecord(err);
    const code = String(visual.code);
    const category: WorkspaceErrorCategory =
      code === "authorization"
        ? "authorization"
        : code === "version_conflict" || code === "draft_stale"
          ? "request_conflict"
          : code === "confirmation_required"
            ? "confirmation_required"
            : code === "asset_not_found" ||
                code === "target_not_found" ||
                code === "draft_not_found"
              ? "invalid_reference"
              : code === "bridge_unavailable"
                ? "execution"
                : code === "execution"
                  ? "execution"
                  : "invalid_input";
    const details = (visual.details ?? {}) as Record<string, unknown>;
    return {
      success: false,
      contractVersion: WORKSPACE_MCP_CONTRACT_VERSION,
      error: {
        category,
        message: String(visual.message),
        details: { ...details, visualCode: code },
      },
    };
  }
  if (err instanceof WorkspaceMcpError) {
    const providerMessage = err.details.providerMessage;
    if (err.category === "execution" && isFetchFailure(providerMessage)) {
      return connectivityErrorPayload(String(providerMessage), err.message);
    }
    return {
      success: false,
      contractVersion: WORKSPACE_MCP_CONTRACT_VERSION,
      error: {
        category: err.category,
        message: err.message,
        details: err.details,
      },
    };
  }

  if (err instanceof z.ZodError) {
    return {
      success: false,
      contractVersion: WORKSPACE_MCP_CONTRACT_VERSION,
      error: {
        category: "invalid_input",
        message: "The Workspace AI input is invalid.",
        details: { issues: err.issues },
      },
    };
  }

  if (
    err instanceof Error &&
    err.name === "BlueprintCompensationError" &&
    typeof err === "object"
  ) {
    const compensation = err as Error & {
      workspaceId?: string;
      retainedEntityIds?: LinkedEntityIds;
      compensationErrors?: string[];
    };
    return {
      success: false,
      contractVersion: WORKSPACE_MCP_CONTRACT_VERSION,
      error: {
        category: "compensation",
        message: err.message,
        details: {
          status: "partial",
          workspaceId: compensation.workspaceId,
          retainedEntityIds: compensation.retainedEntityIds,
          warnings: compensation.compensationErrors ?? [],
        },
      },
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  if (isFetchFailure(message)) {
    return connectivityErrorPayload(message);
  }
  return {
    success: false,
    contractVersion: WORKSPACE_MCP_CONTRACT_VERSION,
    error: {
      category: "execution",
      message,
      details: {},
    },
  };
}
