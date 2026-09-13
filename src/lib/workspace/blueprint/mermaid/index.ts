import type {
  BlueprintFlow,
  BlueprintItem,
  BlueprintSection,
  WorkspaceBlueprint,
} from "../types";
import { parseMermaidFlowchart } from "./parser";
import type { MermaidEdgeAst, MermaidNodeAst } from "./types";

export interface CompileMermaidOptions {
  /** Optional override for workspace name */
  name?: string;
  /** Optional theme color override */
  color?: string;
  /** Optional default section title when no subgraphs exist */
  defaultSectionTitle?: string;
}

/**
 * Compute topological ranks (levels) for a set of nodes.
 * Cycle-tolerant: breaks back-edges to prevent infinite loops.
 */
function computeTopologicalLevels(
  nodeIds: string[],
  edges: MermaidEdgeAst[],
): Map<string, number> {
  const nodeSet = new Set(nodeIds);
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const id of nodeIds) {
    adj.set(id, []);
    inDegree.set(id, 0);
  }

  for (const edge of edges) {
    if (
      edge.from !== edge.to &&
      nodeSet.has(edge.from) &&
      nodeSet.has(edge.to)
    ) {
      adj.get(edge.from)!.push(edge.to);
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    }
  }

  // Roots: inDegree === 0
  let roots = nodeIds.filter((id) => (inDegree.get(id) ?? 0) === 0);
  if (roots.length === 0 && nodeIds.length > 0) {
    roots = [nodeIds[0]];
  }

  const levels = new Map<string, number>();
  const queue: Array<{ id: string; level: number }> = roots.map((id) => ({
    id,
    level: 0,
  }));
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { id, level } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    levels.set(id, level);

    const neighbors = adj.get(id) ?? [];
    for (const nextId of neighbors) {
      if (!visited.has(nextId)) {
        queue.push({ id: nextId, level: level + 1 });
      }
    }
  }

  for (const id of nodeIds) {
    if (!levels.has(id)) {
      levels.set(id, 0);
    }
  }

  return levels;
}

/**
 * Convert a MermaidNodeAst to a native BlueprintItem.
 */
function toBlueprintItem(node: MermaidNodeAst): BlueprintItem {
  switch (node.kind) {
    case "decision":
      return {
        id: node.id,
        kind: "decision",
        question: node.text,
      };
    case "task":
      return {
        id: node.id,
        kind: "task",
        content: node.text,
        priority: node.meta?.priority,
        dueDate: node.meta?.dueDate,
      };
    case "doc":
      return {
        id: node.id,
        kind: "doc",
        title: node.text,
        content: `# ${node.text}\n\n`,
      };
    case "habit":
      return {
        id: node.id,
        kind: "habit",
        name: node.text,
      };
    case "project":
      return {
        id: node.id,
        kind: "project",
        name: node.text,
      };
    case "focus":
      return {
        id: node.id,
        kind: "focus",
      };
    case "event":
      return {
        id: node.id,
        kind: "event",
        title: node.text,
        date: node.meta?.date,
      };
    case "step":
    default:
      return {
        id: node.id,
        kind: "step",
        title: node.text,
      };
  }
}

/**
 * Pure-functional transpiler engine that compiles Mermaid flowchart syntax
 * (`graph LR`, `flowchart TD`, `-->|label|`, `subgraph`, etc.) into a native `WorkspaceBlueprint`.
 */
export function compileMermaidToBlueprint(
  mermaidText: string,
  options?: CompileMermaidOptions,
): WorkspaceBlueprint {
  const ast = parseMermaidFlowchart(mermaidText);
  const allNodeList = Array.from(ast.nodes.values());

  const workspaceName = options?.name ?? ast.title ?? "Flowchart Workspace";
  const workspaceColor = options?.color ?? "#4f46e5";

  const sections: BlueprintSection[] = [];
  const processedNodeIds = new Set<string>();

  // 1. Process explicit subgraphs
  if (ast.subgraphs.length > 0) {
    for (const sub of ast.subgraphs) {
      const items: BlueprintItem[] = [];
      for (const nid of sub.nodeIds) {
        const node = ast.nodes.get(nid);
        if (node) {
          items.push(toBlueprintItem(node));
          processedNodeIds.add(nid);
        }
      }

      sections.push({
        id: sub.id,
        title: sub.title,
        isGroup: true,
        items,
      });
    }

    // Process any remaining loose nodes outside subgraphs
    const looseNodes = allNodeList.filter((n) => !processedNodeIds.has(n.id));
    if (looseNodes.length > 0) {
      sections.push({
        id: "section-general",
        title: options?.defaultSectionTitle ?? "General",
        isGroup: false,
        items: looseNodes.map(toBlueprintItem),
      });
    }
  } else {
    // 2. No subgraphs: partition nodes into topological columns/lanes
    if (allNodeList.length > 0) {
      const nodeIds = allNodeList.map((n) => n.id);
      const levels = computeTopologicalLevels(nodeIds, ast.edges);

      // Group nodes by level
      const levelGroups = new Map<number, MermaidNodeAst[]>();
      for (const node of allNodeList) {
        const lvl = levels.get(node.id) ?? 0;
        if (!levelGroups.has(lvl)) {
          levelGroups.set(lvl, []);
        }
        levelGroups.get(lvl)!.push(node);
      }

      const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b);

      for (const lvl of sortedLevels) {
        const groupNodes = levelGroups.get(lvl)!;
        const stageNum = lvl + 1;
        sections.push({
          id: `section-stage-${stageNum}`,
          title: `Stage ${stageNum}`,
          isGroup: false,
          items: groupNodes.map(toBlueprintItem),
        });
      }
    }
  }

  // 3. Compile flows
  const flows: BlueprintFlow[] = [];
  for (const edge of ast.edges) {
    if (
      ast.nodes.has(edge.from) &&
      ast.nodes.has(edge.to) &&
      edge.from !== edge.to
    ) {
      const flow: BlueprintFlow = {
        fromItemId: edge.from,
        toItemId: edge.to,
      };
      if (edge.label) {
        flow.label = edge.label;
      }
      if (edge.fromPort) {
        flow.fromPort = edge.fromPort;
      }
      flows.push(flow);
    }
  }

  return {
    name: workspaceName,
    color: workspaceColor,
    sections,
    flows,
  };
}

export * from "./parser";
export * from "./types";
