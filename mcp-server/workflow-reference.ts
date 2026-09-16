import { WORKSPACE_MCP_CONTRACT_VERSION } from "../src/lib/workspace/ai-contract";

/**
 * Compact MCP-only compatibility reference. Detailed node semantics and
 * persistence rules stay in mcp-server/instructions.md and the domain node
 * specification; this prompt only carries sequencing and safety decisions.
 */
export const GENERIC_WORKSPACE_WORKFLOW_REFERENCE = `Kagelin Workspace Builder MCP workflow (contract ${WORKSPACE_MCP_CONTRACT_VERSION})

Creation:
1. Call inspect_app_context with a bounded limit (and query/kind filters when useful).
2. Reuse matching Task/Habit/Project IDs in a canonical Blueprint; ask only focused questions for missing stage/timeline decisions.
3. Use build_workspace with { blueprint } for detailed semantic fields, or { mermaid } for a concise topology-first flow. Consume the operation receipt and its itemNodeIds/linkedEntityIds; verify with get_workspace_blueprint when warnings or complexity make the result ambiguous.

Existing Workspace changes:
1. Call list_workspaces and resolve an explicit target; report ambiguity instead of guessing.
2. Call get_workspace_blueprint for the current node, group, position, size, and Connection IDs.
3. Create a localized { patch } containing only requested additions/updates/removals. Never rebuild an existing Workspace. Ask for confirmation before node/Connection deletion or a broad batch, then send destructiveConfirmation: true.
4. Consume the patch receipt. Re-read with get_workspace_blueprint after topology changes, deletion, batches, or warnings.

Contract ${WORKSPACE_MCP_CONTRACT_VERSION} kinds: doc, task, habit, project, focus, decision, step, image (asset reference), visual groups, and visual Connections. Visual assets are inspected explicitly with inspect_visual; typed Visual relations are separate from canvas Connections, and image-to-flow conversion stays a pending draft until the user confirms it. Event nodes are unsupported. Connections and Visual relations are non-executing relationships: they do not schedule, evaluate, trigger, or propagate runtime behavior.

Every mutation is Account-scoped and validates references before writing. requestId is process-local retry protection: the same operation and canonical input replays its receipt; a conflicting reuse fails. Full MCP contract and node details: mcp-server/instructions.md.`;
