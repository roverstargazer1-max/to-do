import type { NodePosition } from "@/lib/types/workspace";
import type {
  BlueprintItem,
  CompiledBlueprintLayout,
  CompiledLayoutBounds,
  CompiledLayoutEdge,
  CompiledLayoutNode,
  WorkspaceBlueprint,
} from "./types";

/**
 * Deterministic Auto-Layout Constants for Workspace Canvas
 * (Parent: .scratch/workspace-ai-builder/spec.md - Implementation Decision 3)
 */
export const LAYOUT_CONSTANTS = {
  /** Horizontal column/lane gap */
  COLUMN_GAP: 80,
  /** Vertical card gap within a column or group */
  CARD_GAP: 20,
  /** Inner padding for group containers (left, right, bottom) */
  GROUP_PADDING: 24,
  /** Header clearance inside group container from top edge to first child */
  GROUP_HEADER_CLEARANCE: 48,
  /** Minimum group container dimensions */
  GROUP_MIN_WIDTH: 240,
  GROUP_MIN_HEIGHT: 160,
  /** Standard card dimensions (px) */
  CARD_DIMENSIONS: {
    task: { width: 260, height: 96 },
    habit: { width: 240, height: 88 },
    project: { width: 280, height: 120 },
    focus: { width: 220, height: 100 },
    doc: {
      width: 280,
      minHeight: 160,
      defaultHeight: 180,
      baseChrome: 60,
      lineHeight: 20,
      charsPerLine: 32,
    },
  },
} as const;

export interface LayoutOptions {
  /** Canvas starting coordinate (default: { x: 0, y: 0 }) */
  origin?: NodePosition;
  /** Horizontal column/lane gap override (default: 80) */
  columnGap?: number;
  /** Vertical card gap override (default: 20) */
  cardGap?: number;
  /** Group inner padding override (default: 24) */
  groupPadding?: number;
  /** Group header clearance override (default: 48) */
  groupHeaderClearance?: number;
}

export interface NodeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Estimate dynamic height for a Doc card based on Markdown text volume.
 * Kagelin Doc cards have a fixed width of 280px, a header with title (~60px base chrome),
 * and Markdown body with line-height ~20px and ~32 characters per wrapped line.
 * Minimum height is 160px; default height for empty/minimal content is 180px.
 */
export function estimateDocHeight(content?: string, _title?: string): number {
  if (content === undefined || content === null) {
    return LAYOUT_CONSTANTS.CARD_DIMENSIONS.doc.defaultHeight;
  }
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return LAYOUT_CONSTANTS.CARD_DIMENSIONS.doc.defaultHeight;
  }

  const { baseChrome, lineHeight, charsPerLine, minHeight } =
    LAYOUT_CONSTANTS.CARD_DIMENSIONS.doc;

  const lines = trimmed.split("\n");
  let visualLines = 0;

  for (const line of lines) {
    const lineLength = line.trimEnd().length;
    if (lineLength === 0) {
      visualLines += 1;
    } else {
      visualLines += Math.max(1, Math.ceil(lineLength / charsPerLine));
    }
  }

  const estimated = baseChrome + visualLines * lineHeight;
  return Math.max(minHeight, estimated);
}

/**
 * Resolve standard dimensions for any BlueprintItem.
 */
export function getItemDimensions(item: BlueprintItem): {
  width: number;
  height: number;
} {
  switch (item.kind) {
    case "task":
      return {
        width: LAYOUT_CONSTANTS.CARD_DIMENSIONS.task.width,
        height: LAYOUT_CONSTANTS.CARD_DIMENSIONS.task.height,
      };
    case "habit":
      return {
        width: LAYOUT_CONSTANTS.CARD_DIMENSIONS.habit.width,
        height: LAYOUT_CONSTANTS.CARD_DIMENSIONS.habit.height,
      };
    case "project":
      return {
        width: LAYOUT_CONSTANTS.CARD_DIMENSIONS.project.width,
        height: LAYOUT_CONSTANTS.CARD_DIMENSIONS.project.height,
      };
    case "focus":
      return {
        width: LAYOUT_CONSTANTS.CARD_DIMENSIONS.focus.width,
        height: LAYOUT_CONSTANTS.CARD_DIMENSIONS.focus.height,
      };
    case "doc":
      return {
        width: LAYOUT_CONSTANTS.CARD_DIMENSIONS.doc.width,
        height: estimateDocHeight(item.content, item.title),
      };
  }
}

/**
 * Extract an item's title or display label.
 */
function getItemTitle(item: BlueprintItem): string | undefined {
  if ("title" in item) return item.title;
  if ("name" in item) return item.name;
  if ("content" in item) return item.content;
  return undefined;
}

/**
 * Extract an item's color if specified.
 */
function getItemColor(item: BlueprintItem): string | undefined {
  if ("color" in item) return item.color;
  return undefined;
}

/**
 * Calculate absolute canvas bounds for a node.
 * If the node belongs to a group, converts its relative coordinates (x, y)
 * to absolute canvas coordinates (groupX + x, groupY + y).
 */
export function getNodeAbsoluteBounds(
  node: CompiledLayoutNode,
  nodesById: Map<string, CompiledLayoutNode>,
): NodeBounds {
  if (node.groupId) {
    const parentGroup = nodesById.get(node.groupId);
    if (parentGroup) {
      return {
        x: parentGroup.position.x + node.position.x,
        y: parentGroup.position.y + node.position.y,
        width: node.width,
        height: node.height,
      };
    }
  }
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.width,
    height: node.height,
  };
}

/**
 * Check whether two axis-aligned bounding boxes overlap with non-zero area.
 */
export function doBoundsOverlap(a: NodeBounds, b: NodeBounds): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Verify whether a child node strictly falls inside its parent group container,
 * respecting inner padding and top header clearance.
 */
export function isNodeWithinGroup(
  child: CompiledLayoutNode,
  group: CompiledLayoutNode,
  options?: { groupPadding?: number; groupHeaderClearance?: number },
): boolean {
  const padding = options?.groupPadding ?? LAYOUT_CONSTANTS.GROUP_PADDING;
  const headerClearance =
    options?.groupHeaderClearance ?? LAYOUT_CONSTANTS.GROUP_HEADER_CLEARANCE;

  const withinX =
    child.position.x >= padding &&
    child.position.x + child.width <= group.width - padding;
  const withinY =
    child.position.y >= headerClearance &&
    child.position.y + child.height <= group.height - padding;

  return withinX && withinY;
}

/**
 * Deterministic Auto-Layout Compiler.
 *
 * Translates a declarative WorkspaceBlueprint into collision-free canvas coordinates.
 *
 * Rules:
 * 1. Sections are laid out sequentially from left to right in columns/lanes (80px gap).
 * 2. Items within sections are stacked vertically (20px gap).
 * 3. Group sections (`isGroup: true`):
 *    - Wraps all member items in a parent `group` node with 24px inner padding & 48px header clearance.
 *    - Member item coordinates are converted to group-relative `(x - gx, y - gy)`.
 *    - The group container precedes its members in the nodes array for proper DOM stacking.
 * 4. Non-group sections (`isGroup: false` / omitted):
 *    - Items receive absolute canvas coordinates.
 *    - No parent container node is minted.
 * 5. Flows are parsed into `CompiledLayoutEdge` linking valid source and target node IDs.
 * 6. Generates full layout bounding box (`minX`, `minY`, `maxX`, `maxY`, `width`, `height`).
 */
export function compileBlueprintLayout(
  blueprint: WorkspaceBlueprint,
  options?: LayoutOptions,
): CompiledBlueprintLayout {
  const origin = options?.origin ?? { x: 0, y: 0 };
  const columnGap = options?.columnGap ?? LAYOUT_CONSTANTS.COLUMN_GAP;
  const cardGap = options?.cardGap ?? LAYOUT_CONSTANTS.CARD_GAP;
  const groupPadding = options?.groupPadding ?? LAYOUT_CONSTANTS.GROUP_PADDING;
  const headerClearance =
    options?.groupHeaderClearance ?? LAYOUT_CONSTANTS.GROUP_HEADER_CLEARANCE;

  const nodes: CompiledLayoutNode[] = [];
  const edges: CompiledLayoutEdge[] = [];
  const nodeIdSet = new Set<string>();

  let currentX = origin.x;

  for (const section of blueprint.sections) {
    const isGroup = Boolean(section.isGroup);
    const items = section.items;

    if (isGroup) {
      // Calculate group bounding box and stacked children relative coordinates
      if (items.length === 0) {
        const groupWidth = LAYOUT_CONSTANTS.GROUP_MIN_WIDTH;
        const groupHeight = LAYOUT_CONSTANTS.GROUP_MIN_HEIGHT;

        const groupNode: CompiledLayoutNode = {
          id: section.id,
          kind: "group",
          position: { x: currentX, y: origin.y },
          width: groupWidth,
          height: groupHeight,
          groupId: null,
          sectionId: section.id,
          title: section.title,
          color: section.color,
        };

        nodes.push(groupNode);
        nodeIdSet.add(groupNode.id);
        currentX += groupWidth + columnGap;
      } else {
        const itemDimensions = items.map((item) => getItemDimensions(item));
        const maxChildWidth = Math.max(...itemDimensions.map((d) => d.width));
        const groupWidth = Math.max(
          LAYOUT_CONSTANTS.GROUP_MIN_WIDTH,
          maxChildWidth + groupPadding * 2,
        );

        let currentRelY = headerClearance;
        const memberNodes: CompiledLayoutNode[] = [];

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const dims = itemDimensions[i];

          const memberNode: CompiledLayoutNode = {
            id: item.id,
            kind: item.kind,
            position: { x: groupPadding, y: currentRelY },
            width: dims.width,
            height: dims.height,
            groupId: section.id,
            sectionId: section.id,
            title: getItemTitle(item),
            color: getItemColor(item),
            item,
          };

          memberNodes.push(memberNode);
          currentRelY += dims.height + cardGap;
        }

        const lastChildBottom = currentRelY - cardGap;
        const groupHeight = Math.max(
          LAYOUT_CONSTANTS.GROUP_MIN_HEIGHT,
          lastChildBottom + groupPadding,
        );

        const groupNode: CompiledLayoutNode = {
          id: section.id,
          kind: "group",
          position: { x: currentX, y: origin.y },
          width: groupWidth,
          height: groupHeight,
          groupId: null,
          sectionId: section.id,
          title: section.title,
          color: section.color,
        };

        // Group container comes first so it renders behind member nodes
        nodes.push(groupNode);
        nodeIdSet.add(groupNode.id);

        for (const member of memberNodes) {
          nodes.push(member);
          nodeIdSet.add(member.id);
        }

        currentX += groupWidth + columnGap;
      }
    } else {
      // Standalone section: items receive absolute canvas coordinates
      if (items.length > 0) {
        const itemDimensions = items.map((item) => getItemDimensions(item));
        const maxItemWidth = Math.max(...itemDimensions.map((d) => d.width));
        let currentAbsY = origin.y;

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const dims = itemDimensions[i];

          const standaloneNode: CompiledLayoutNode = {
            id: item.id,
            kind: item.kind,
            position: { x: currentX, y: currentAbsY },
            width: dims.width,
            height: dims.height,
            groupId: null,
            sectionId: section.id,
            title: getItemTitle(item),
            color: getItemColor(item),
            item,
          };

          nodes.push(standaloneNode);
          nodeIdSet.add(item.id);
          currentAbsY += dims.height + cardGap;
        }

        currentX += maxItemWidth + columnGap;
      }
    }
  }

  // Parse declarative flows into deterministic compiled edges
  if (blueprint.flows) {
    for (const flow of blueprint.flows) {
      // Filter out invalid flows referencing non-existent nodes or self-loops
      if (
        nodeIdSet.has(flow.fromItemId) &&
        nodeIdSet.has(flow.toItemId) &&
        flow.fromItemId !== flow.toItemId
      ) {
        edges.push({
          id: `flow-${flow.fromItemId}-${flow.toItemId}`,
          sourceNodeId: flow.fromItemId,
          targetNodeId: flow.toItemId,
        });
      }
    }
  }

  // Calculate layout bounding box
  let bounds: CompiledLayoutBounds;
  const topLevelNodes = nodes.filter((n) => !n.groupId);

  if (topLevelNodes.length === 0) {
    bounds = {
      minX: origin.x,
      minY: origin.y,
      maxX: origin.x,
      maxY: origin.y,
      width: 0,
      height: 0,
    };
  } else {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of topLevelNodes) {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + node.width);
      maxY = Math.max(maxY, node.position.y + node.height);
    }

    bounds = {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  return {
    nodes,
    edges,
    bounds,
  };
}
