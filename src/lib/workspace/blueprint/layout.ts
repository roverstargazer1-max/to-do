import type { NodePosition } from "@/lib/types/workspace";
import type {
  BlueprintFlow,
  BlueprintItem,
  BlueprintSection,
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
  /** Horizontal column/lane gap expanded from 80px to 120px */
  COLUMN_GAP: 120,
  /** Vertical card gap expanded from 20px to 40px */
  CARD_GAP: 40,
  /** Inner padding for group containers expanded from 24px to 32px */
  GROUP_PADDING: 32,
  /** Header clearance inside group container */
  GROUP_HEADER_CLEARANCE: 52,
  /** Minimum group container dimensions */
  GROUP_MIN_WIDTH: 320,
  GROUP_MIN_HEIGHT: 200,
  /** Standard card dimensions (px) */
  CARD_DIMENSIONS: {
    task: { width: 280, height: 96 },
    habit: { width: 260, height: 88 },
    event: { width: 260, height: 88 },
    project: { width: 300, height: 120 },
    focus: { width: 240, height: 100 },
    decision: { width: 240, height: 120 },
    step: { width: 280, height: 88 },
    image: { width: 320, height: 240 },
    doc: {
      width: 360,
      minHeight: 160,
      defaultHeight: 200,
      maxHeight: 480,
      baseChrome: 76,
      lineHeight: 22,
      charsPerLine: 38,
    },
  },
} as const;

export interface LayoutOptions {
  /** Canvas starting coordinate (default: { x: 0, y: 0 }) */
  origin?: NodePosition;
  /** Horizontal column/lane gap override (default: 80) */
  columnGap?: number;
  /** Vertical card gap override (default: 32) */
  cardGap?: number;
  /** Group inner padding override (default: 24) */
  groupPadding?: number;
  /** Group header clearance override (default: 48) */
  groupHeaderClearance?: number;
}

export interface NodeGeometricInfo {
  position?: { x: number; y: number };
  position_x?: number;
  position_y?: number;
  width?: number | null;
  groupId?: string | null;
  group_id?: string | null;
}

export interface OptimalHandles {
  sourceHandle: "out-bottom" | "out";
  targetHandle: "in-top" | "in";
}

/**
 * Pure topological helper to resolve optimal connection handles based on relative geometric bounds.
 *
 * Routing rules:
 * - When target.y > source.y AND horizontal centers are aligned (diverge by <= 80px):
 *   route vertically via out-bottom -> in-top.
 * - Otherwise (lateral flows, cross-column branches with diff > 80px, or target.y <= source.y):
 *   preserve standard horizontal left-to-right routing via out -> in.
 */
export function resolveOptimalHandles(
  sourceNode?: NodeGeometricInfo | null,
  targetNode?: NodeGeometricInfo | null,
): OptimalHandles {
  if (!sourceNode || !targetNode) {
    return { sourceHandle: "out", targetHandle: "in" };
  }

  const sourceX = sourceNode.position?.x ?? sourceNode.position_x ?? 0;
  const sourceY = sourceNode.position?.y ?? sourceNode.position_y ?? 0;
  const targetX = targetNode.position?.x ?? targetNode.position_x ?? 0;
  const targetY = targetNode.position?.y ?? targetNode.position_y ?? 0;

  const sourceWidth = sourceNode.width ?? 0;
  const targetWidth = targetNode.width ?? 0;

  const sourceCenter = sourceX + sourceWidth / 2;
  const targetCenter = targetX + targetWidth / 2;
  const horizontalCenterDiff = Math.abs(sourceCenter - targetCenter);

  // Vertical sequential flow only applies when nodes belong to the same aligned column
  const isVerticalFlow = targetY > sourceY && horizontalCenterDiff <= 80;

  if (isVerticalFlow) {
    return {
      sourceHandle: "out-bottom",
      targetHandle: "in-top",
    };
  }

  return {
    sourceHandle: "out",
    targetHandle: "in",
  };
}

export interface NodeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Element-aware Markdown height estimation model.
 *
 * Parses block-level Markdown elements:
 * - Base chrome: 76px (card header, inner padding, border)
 * - Heading lines (H1/H2 `#`, `##`): 48px per line
 * - Subheadings (H3-H6 `###`): 36px per line
 * - Blank line paragraph breaks: 16px vertical gap
 * - Bullet/numbered lists (`-`, `*`, `1.`): 26px per item
 * - Code blocks (```): 32px per code line + 16px block margin
 * - Standard prose: 22px per visual line (based on charsPerLine)
 * - Safety margin: +24px padding added to all estimated heights
 *
 * Bounded by minHeight (160px) and maxHeight (480px).
 */
export function estimateDocHeight(content?: string, _title?: string): number {
  if (content === undefined || content === null) {
    return LAYOUT_CONSTANTS.CARD_DIMENSIONS.doc.defaultHeight;
  }
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return LAYOUT_CONSTANTS.CARD_DIMENSIONS.doc.defaultHeight;
  }

  const {
    baseChrome = 76,
    lineHeight = 22,
    charsPerLine = 38,
    minHeight = 160,
  } = LAYOUT_CONSTANTS.CARD_DIMENSIONS.doc;
  const maxHeight =
    (LAYOUT_CONSTANTS.CARD_DIMENSIONS.doc as { maxHeight?: number })
      .maxHeight ?? 480;

  const lines = trimmed.split("\n");
  let totalHeight = baseChrome;
  let inCodeBlock = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Code block fences
    if (line.trim().startsWith("```")) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        totalHeight += 16;
      } else {
        inCodeBlock = false;
        totalHeight += 16;
      }
      continue;
    }

    if (inCodeBlock) {
      totalHeight += 32;
      continue;
    }

    const trimmedLine = line.trim();

    // Blank line / paragraph breaks
    if (trimmedLine.length === 0) {
      totalHeight += 16;
      continue;
    }

    // Heading lines (H1/H2): 48px per line
    if (/^#{1,2}\s+/.test(trimmedLine)) {
      const headingText = trimmedLine.replace(/^#{1,2}\s+/, "");
      const wrapCount = Math.max(
        1,
        Math.ceil(
          headingText.length / Math.max(1, Math.round(charsPerLine * 0.7)),
        ),
      );
      totalHeight += wrapCount * 48;
      continue;
    }

    // Subheadings (H3-H6): 36px per line
    if (/^#{3,6}\s+/.test(trimmedLine)) {
      const headingText = trimmedLine.replace(/^#{3,6}\s+/, "");
      const wrapCount = Math.max(
        1,
        Math.ceil(
          headingText.length / Math.max(1, Math.round(charsPerLine * 0.8)),
        ),
      );
      totalHeight += wrapCount * 36;
      continue;
    }

    // Bullet/numbered lists: 26px per item
    if (/^(\s*[-*+]|\s*\d+\.)\s+/.test(line)) {
      const itemText = line.replace(/^(\s*[-*+]|\s*\d+\.)\s+/, "");
      const wrapCount = Math.max(
        1,
        Math.ceil(itemText.length / Math.max(1, charsPerLine - 4)),
      );
      totalHeight += 26 + (wrapCount - 1) * lineHeight;
      continue;
    }

    // Standard prose: 22px per visual line
    const visualLines = Math.max(
      1,
      Math.ceil(trimmedLine.length / charsPerLine),
    );
    totalHeight += visualLines * lineHeight;
  }

  // Safety buffer: +24px padding added to all estimated heights
  const estimated = totalHeight + 24;
  const bounded = Math.max(minHeight, estimated);
  return Math.min(maxHeight, bounded);
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
    case "event":
      return {
        width: LAYOUT_CONSTANTS.CARD_DIMENSIONS.event.width,
        height: LAYOUT_CONSTANTS.CARD_DIMENSIONS.event.height,
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
    case "decision":
      return {
        width: LAYOUT_CONSTANTS.CARD_DIMENSIONS.decision.width,
        height: LAYOUT_CONSTANTS.CARD_DIMENSIONS.decision.height,
      };
    case "step":
      return {
        width: LAYOUT_CONSTANTS.CARD_DIMENSIONS.step.width,
        height: LAYOUT_CONSTANTS.CARD_DIMENSIONS.step.height,
      };
    case "image":
      return {
        width: LAYOUT_CONSTANTS.CARD_DIMENSIONS.image.width,
        height: LAYOUT_CONSTANTS.CARD_DIMENSIONS.image.height,
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
  if ("question" in item) return item.question;
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
 * Identify item IDs belonging to secondary branch column within a section.
 */
function resolveSectionBranchItemIds(
  section: BlueprintSection,
  flows?: BlueprintFlow[],
): Set<string> {
  const branchItemIds = new Set<string>();
  const sectionItemIds = new Set(section.items.map((it) => it.id));

  // 1. Explicitly marked items (branch: true or column: "branch")
  for (const item of section.items) {
    if (
      item.branch ||
      (item as unknown as { column?: string }).column === "branch"
    ) {
      branchItemIds.add(item.id);
    }
  }

  // 2. Items targeted by branch flows from within the section
  if (flows) {
    const isBranchLabel = (label?: string) =>
      Boolean(
        label &&
        /异常|回滚|熔断|fail|abnormal|rollback|exception|deny|reject|error/i.test(
          label,
        ),
      );

    for (const flow of flows) {
      if (
        sectionItemIds.has(flow.fromItemId) &&
        sectionItemIds.has(flow.toItemId) &&
        isBranchLabel(flow.label)
      ) {
        branchItemIds.add(flow.toItemId);
      }
    }

    // 3. Chained flows within the section (if A is branch and A -> B within section, B is also branch)
    let changed = true;
    while (changed) {
      changed = false;
      for (const flow of flows) {
        if (
          sectionItemIds.has(flow.fromItemId) &&
          sectionItemIds.has(flow.toItemId) &&
          branchItemIds.has(flow.fromItemId) &&
          !branchItemIds.has(flow.toItemId)
        ) {
          branchItemIds.add(flow.toItemId);
          changed = true;
        }
      }
    }
  }

  return branchItemIds;
}

/**
 * Deterministic Auto-Layout Compiler.
 *
 * Translates a declarative WorkspaceBlueprint into collision-free canvas coordinates.
 *
 * Rules:
 * 1. Sections are laid out sequentially from left to right in columns/lanes.
 * 2. Items within sections are stacked vertically.
 * 3. Group sections (`isGroup: true`):
 *    - Supports dual-track branch columns when branching items exist (Offset X: +320px).
 *    - Wraps all member items in a parent `group` node with padding & header clearance.
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
        const branchItemIds = resolveSectionBranchItemIds(
          section,
          blueprint.flows,
        );
        const hasTwoTracks =
          branchItemIds.size > 0 &&
          items.some((it) => !branchItemIds.has(it.id));

        if (!hasTwoTracks) {
          // Standard single column layout within group
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

          nodes.push(groupNode);
          nodeIdSet.add(groupNode.id);

          for (const member of memberNodes) {
            nodes.push(member);
            nodeIdSet.add(member.id);
          }

          currentX += groupWidth + columnGap;
        } else {
          // Dual-track layout: Primary Column (left) vs Branch Column (right)
          const primaryItems: {
            item: BlueprintItem;
            dims: { width: number; height: number };
          }[] = [];
          const branchItems: {
            item: BlueprintItem;
            dims: { width: number; height: number };
          }[] = [];

          for (const item of items) {
            const dims = getItemDimensions(item);
            if (branchItemIds.has(item.id)) {
              branchItems.push({ item, dims });
            } else {
              primaryItems.push({ item, dims });
            }
          }

          const primaryColumnWidth = Math.max(
            ...primaryItems.map((p) => p.dims.width),
          );
          const branchColumnWidth = Math.max(
            ...branchItems.map((b) => b.dims.width),
          );
          const interColumnGap = cardGap; // 40px breathing corridor

          const calculatedGroupWidth =
            primaryColumnWidth +
            branchColumnWidth +
            interColumnGap +
            groupPadding * 2;
          const groupWidth = Math.max(
            LAYOUT_CONSTANTS.GROUP_MIN_WIDTH,
            calculatedGroupWidth,
          );

          const memberNodes: CompiledLayoutNode[] = [];
          const primaryNodePositions = new Map<
            string,
            { x: number; y: number; height: number }
          >();

          // 1. Layout Primary Column
          let primaryRelY = headerClearance;
          for (const { item, dims } of primaryItems) {
            const pos = { x: groupPadding, y: primaryRelY };
            primaryNodePositions.set(item.id, {
              x: pos.x,
              y: pos.y,
              height: dims.height,
            });

            memberNodes.push({
              id: item.id,
              kind: item.kind,
              position: pos,
              width: dims.width,
              height: dims.height,
              groupId: section.id,
              sectionId: section.id,
              title: getItemTitle(item),
              color: getItemColor(item),
              item,
            });

            primaryRelY += dims.height + cardGap;
          }

          // 2. Layout Branch Column
          const branchRelX = groupPadding + primaryColumnWidth + interColumnGap;
          let branchRelY = headerClearance;

          for (const { item, dims } of branchItems) {
            // Find if this branch item is targeted by a flow from within the primary column
            let anchorY = headerClearance;
            if (blueprint.flows) {
              for (const flow of blueprint.flows) {
                if (
                  flow.toItemId === item.id &&
                  primaryNodePositions.has(flow.fromItemId)
                ) {
                  const sourcePos = primaryNodePositions.get(flow.fromItemId)!;
                  anchorY = Math.max(anchorY, sourcePos.y);
                }
              }
            }

            const itemY = Math.max(branchRelY, anchorY);
            const pos = { x: branchRelX, y: itemY };

            memberNodes.push({
              id: item.id,
              kind: item.kind,
              position: pos,
              width: dims.width,
              height: dims.height,
              groupId: section.id,
              sectionId: section.id,
              title: getItemTitle(item),
              color: getItemColor(item),
              item,
            });

            branchRelY = itemY + dims.height + cardGap;
          }

          const maxChildBottom = Math.max(
            primaryRelY - cardGap,
            branchRelY - cardGap,
            headerClearance,
          );
          const groupHeight = Math.max(
            LAYOUT_CONSTANTS.GROUP_MIN_HEIGHT,
            maxChildBottom + groupPadding,
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
    const nodesById = new Map<string, CompiledLayoutNode>(
      nodes.map((n) => [n.id, n]),
    );

    for (const flow of blueprint.flows) {
      // Filter out invalid flows referencing non-existent nodes or self-loops
      if (
        nodeIdSet.has(flow.fromItemId) &&
        nodeIdSet.has(flow.toItemId) &&
        flow.fromItemId !== flow.toItemId
      ) {
        const sourceNode = nodesById.get(flow.fromItemId);
        const targetNode = nodesById.get(flow.toItemId);
        let optimal: OptimalHandles = {
          sourceHandle: "out",
          targetHandle: "in",
        };

        if (sourceNode && targetNode) {
          const sourceAbs = getNodeAbsoluteBounds(sourceNode, nodesById);
          const targetAbs = getNodeAbsoluteBounds(targetNode, nodesById);
          optimal = resolveOptimalHandles(
            {
              position: { x: sourceAbs.x, y: sourceAbs.y },
              width: sourceAbs.width,
              groupId: sourceNode.groupId,
            },
            {
              position: { x: targetAbs.x, y: targetAbs.y },
              width: targetAbs.width,
              groupId: targetNode.groupId,
            },
          );
        }

        edges.push({
          id: `flow-${flow.fromItemId}-${flow.toItemId}`,
          sourceNodeId: flow.fromItemId,
          targetNodeId: flow.toItemId,
          label: flow.label ?? null,
          sourceHandle: flow.fromPort ?? optimal.sourceHandle,
          targetHandle: flow.toPort ?? optimal.targetHandle,
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
