import { QueryClient } from "@tanstack/react-query";
import type {
  BlueprintPatch,
  BlueprintDecisionItem,
  BlueprintDocItem,
  BlueprintHabitItem,
  BlueprintProjectItem,
  BlueprintStepItem,
  BlueprintTaskItem,
} from "./types";
import { BlueprintPatchSchema } from "./types";
import { getItemDimensions, LAYOUT_CONSTANTS } from "./layout";
import { workspaceMutations } from "@/lib/mutations/workspace";
import type { WorkspaceNode, WorkspaceEdge } from "@/lib/types/workspace";
import {
  defaultBlueprintCommandAdapters,
  type BlueprintCommandAdapters,
} from "./commands";

export interface PatchOptions {
  queryClient?: QueryClient;
  isGuestMode?: boolean;
  nodes?: WorkspaceNode[];
  edges?: WorkspaceEdge[];
  onResolveProject?: (name: string) => Promise<string | undefined>;
  onResolveHabit?: (name: string) => Promise<string | undefined>;
  commandAdapters?: BlueprintCommandAdapters;
}

export interface PatchResult {
  workspaceId: string;
  addedNodes: WorkspaceNode[];
  removedNodeIds: string[];
  updatedDocNodeIds: string[];
  updatedDecisionNodeIds?: string[];
  updatedStepNodeIds?: string[];
  addedEdges: WorkspaceEdge[];
  removedEdgeIds: string[];
  itemNodeIds: Record<string, string>;
  linkedEntityIds: {
    tasks: string[];
    habits: string[];
    projects: string[];
  };
  createdEntityIds: {
    tasks: string[];
    habits: string[];
    projects: string[];
  };
}

/**
 * Applies an incremental semantic patch to an existing workspace.
 * Preserves the exact positions of untouched cards.
 */
export async function applyWorkspacePatch(
  patch: BlueprintPatch,
  options?: PatchOptions,
): Promise<PatchResult> {
  // 1. Validate patch schema
  BlueprintPatchSchema.parse(patch);

  // 2. Fetch existing canvas nodes and edges
  const existingNodes =
    options?.nodes ?? (await workspaceMutations.listNodes(patch.workspaceId));
  const existingEdges =
    options?.edges ?? (await workspaceMutations.listEdges(patch.workspaceId));

  const existingNodesById = new Map<string, WorkspaceNode>(
    existingNodes.map((n) => [n.id, n]),
  );
  const existingEdgesById = new Map<string, WorkspaceEdge>(
    existingEdges.map((e) => [e.id, e]),
  );
  const commands = options?.commandAdapters ?? defaultBlueprintCommandAdapters;

  // 3. Pre-validate IDs before executing mutations
  if (patch.updateDocs && patch.updateDocs.length > 0) {
    for (const u of patch.updateDocs) {
      const target = existingNodesById.get(u.nodeId);
      if (!target) {
        throw new Error(`Cannot update doc: node "${u.nodeId}" not found`);
      }
      if (target.kind !== "doc") {
        throw new Error(
          `Cannot update doc: node "${u.nodeId}" is not a doc node`,
        );
      }
    }
  }

  if (patch.updateDecisions && patch.updateDecisions.length > 0) {
    for (const u of patch.updateDecisions) {
      const target = existingNodesById.get(u.nodeId);
      if (!target) {
        throw new Error(`Cannot update decision: node "${u.nodeId}" not found`);
      }
      if (target.kind !== "decision") {
        throw new Error(
          `Cannot update decision: node "${u.nodeId}" is not a decision node`,
        );
      }
    }
  }

  if (patch.updateSteps && patch.updateSteps.length > 0) {
    for (const u of patch.updateSteps) {
      const target = existingNodesById.get(u.nodeId);
      if (!target) {
        throw new Error(`Cannot update step: node "${u.nodeId}" not found`);
      }
      if (target.kind !== "step") {
        throw new Error(
          `Cannot update step: node "${u.nodeId}" is not a step node`,
        );
      }
    }
  }

  if (patch.removeNodeIds && patch.removeNodeIds.length > 0) {
    for (const id of patch.removeNodeIds) {
      if (!existingNodesById.has(id)) {
        throw new Error(`Cannot remove node: node "${id}" not found`);
      }
    }
  }

  if (patch.removeEdgeIds && patch.removeEdgeIds.length > 0) {
    for (const id of patch.removeEdgeIds) {
      if (!existingEdgesById.has(id)) {
        throw new Error(`Cannot remove edge: edge "${id}" not found`);
      }
    }
  }

  const newAddIds = new Set<string>();
  if (patch.addItems && patch.addItems.length > 0) {
    for (const add of patch.addItems) {
      if (newAddIds.has(add.item.id)) {
        throw new Error(`Cannot add item: duplicate item "${add.item.id}"`);
      }
      if (existingNodesById.has(add.item.id)) {
        throw new Error(
          `Cannot add item: node "${add.item.id}" already exists`,
        );
      }
      newAddIds.add(add.item.id);
      const targetGroupId = add.targetGroupId ?? add.sectionId;
      if (targetGroupId) {
        const groupNode = existingNodesById.get(targetGroupId);
        if (!groupNode || groupNode.kind !== "group") {
          throw new Error(`Target group "${targetGroupId}" not found`);
        }
      }
    }
  }

  if (patch.addFlows && patch.addFlows.length > 0) {
    const requestedPairs = new Set<string>();
    for (const flow of patch.addFlows) {
      if (flow.fromItemId === flow.toItemId) {
        throw new Error("Cannot add flow: self-connections are not allowed");
      }
      const hasSource =
        existingNodesById.has(flow.fromItemId) ||
        newAddIds.has(flow.fromItemId);
      const hasTarget =
        existingNodesById.has(flow.toItemId) || newAddIds.has(flow.toItemId);
      if (!hasSource) {
        throw new Error(`Cannot add flow: node "${flow.fromItemId}" not found`);
      }
      if (!hasTarget) {
        throw new Error(`Cannot add flow: node "${flow.toItemId}" not found`);
      }
      if (
        patch.removeNodeIds?.includes(flow.fromItemId) ||
        patch.removeNodeIds?.includes(flow.toItemId)
      ) {
        throw new Error("Cannot add flow: an endpoint is being removed");
      }
      const pair = `${flow.fromItemId}\u0000${flow.toItemId}`;
      if (requestedPairs.has(pair)) {
        throw new Error(
          "Cannot add flow: duplicate connections are not allowed",
        );
      }
      requestedPairs.add(pair);
      const existingPair = existingEdges.find(
        (edge) =>
          edge.source_node_id === flow.fromItemId &&
          edge.target_node_id === flow.toItemId,
      );
      if (existingPair && !patch.removeEdgeIds?.includes(existingPair.id)) {
        throw new Error("Cannot add flow: duplicate connection already exists");
      }
    }
  }

  // 4. Command context setup
  const queryClient =
    options?.queryClient ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

  const isGuestMode =
    options?.isGuestMode ??
    (typeof window !== "undefined" &&
      localStorage.getItem("kanso_guest_mode") === "true");

  const cmdCtx = { queryClient, isGuestMode };

  // 5. Execute doc updates
  const updatedDocNodeIds: string[] = [];
  if (patch.updateDocs && patch.updateDocs.length > 0) {
    for (const u of patch.updateDocs) {
      await commands.node.updateDocNode(cmdCtx, {
        workspaceId: patch.workspaceId,
        nodeId: u.nodeId,
        title: u.title,
        content: u.content,
      });
      updatedDocNodeIds.push(u.nodeId);
    }
  }

  // 5b. Execute decision updates
  const updatedDecisionNodeIds: string[] = [];
  if (patch.updateDecisions && patch.updateDecisions.length > 0) {
    for (const u of patch.updateDecisions) {
      await commands.node.updateDecisionNode(cmdCtx, {
        workspaceId: patch.workspaceId,
        nodeId: u.nodeId,
        question: u.question,
        description: u.description,
      });
      updatedDecisionNodeIds.push(u.nodeId);
    }
  }

  // 5c. Execute step updates
  const updatedStepNodeIds: string[] = [];
  if (patch.updateSteps && patch.updateSteps.length > 0) {
    for (const u of patch.updateSteps) {
      await commands.node.updateStepNode(cmdCtx, {
        workspaceId: patch.workspaceId,
        nodeId: u.nodeId,
        title: u.title,
        description: u.description,
      });
      updatedStepNodeIds.push(u.nodeId);
    }
  }

  // 6. Execute node removals
  const removedNodeIds: string[] = [];
  if (patch.removeNodeIds && patch.removeNodeIds.length > 0) {
    for (const id of patch.removeNodeIds) {
      await commands.node.remove(cmdCtx, {
        id,
        workspace_id: patch.workspaceId,
      });
      removedNodeIds.push(id);
      existingNodesById.delete(id);
    }
  }

  // 7. Execute edge removals
  const removedEdgeIds: string[] = [];
  if (patch.removeEdgeIds && patch.removeEdgeIds.length > 0) {
    for (const id of patch.removeEdgeIds) {
      await commands.edge.remove(cmdCtx, {
        id,
        workspace_id: patch.workspaceId,
      });
      removedEdgeIds.push(id);
      existingEdgesById.delete(id);
    }
  }

  // 8. Execute item additions
  const addedNodes: WorkspaceNode[] = [];
  const addedNodeIdMap = new Map<string, string>();
  const linkedEntityIds = {
    tasks: new Set<string>(),
    habits: new Set<string>(),
    projects: new Set<string>(),
  };
  const createdEntityIds = {
    tasks: new Set<string>(),
    habits: new Set<string>(),
    projects: new Set<string>(),
  };

  // Track group dimensions and bottom offsets
  const groupBounds = new Map<
    string,
    { width: number; height: number; currentBottom: number }
  >();
  for (const [id, node] of existingNodesById.entries()) {
    if (node.kind === "group") {
      const members = Array.from(existingNodesById.values()).filter(
        (n) => n.group_id === id,
      );
      let currentBottom =
        LAYOUT_CONSTANTS.GROUP_HEADER_CLEARANCE - LAYOUT_CONSTANTS.CARD_GAP;
      for (const m of members) {
        const mBottom = m.position_y + (m.height ?? 100);
        if (mBottom > currentBottom) {
          currentBottom = mBottom;
        }
      }
      groupBounds.set(id, {
        width: node.width ?? LAYOUT_CONSTANTS.GROUP_MIN_WIDTH,
        height: node.height ?? LAYOUT_CONSTANTS.GROUP_MIN_HEIGHT,
        currentBottom,
      });
    }
  }

  // Track layout bounding box of root nodes for standalone placements
  const rootNodes = Array.from(existingNodesById.values()).filter(
    (n) => !n.group_id,
  );
  let maxRootRight = 0;
  let minRootTop = 0;
  if (rootNodes.length > 0) {
    maxRootRight = Math.max(
      ...rootNodes.map((n) => n.position_x + (n.width ?? 260)),
    );
    minRootTop = Math.min(...rootNodes.map((n) => n.position_y));
  }
  const standaloneNextX =
    maxRootRight > 0 ? maxRootRight + LAYOUT_CONSTANTS.COLUMN_GAP : 0;
  let standaloneNextY = minRootTop;

  if (patch.addItems && patch.addItems.length > 0) {
    for (const addItem of patch.addItems) {
      const item = addItem.item;
      const targetGroupId = addItem.targetGroupId ?? addItem.sectionId;
      const dims = getItemDimensions(item);

      let positionX: number;
      let positionY: number;
      let parentGroupId: string | null = null;

      if (targetGroupId) {
        parentGroupId = targetGroupId;
        const gInfo = groupBounds.get(targetGroupId)!;
        positionX = LAYOUT_CONSTANTS.GROUP_PADDING;
        positionY = gInfo.currentBottom + LAYOUT_CONSTANTS.CARD_GAP;

        const newBottom = positionY + dims.height;
        gInfo.currentBottom = newBottom;

        const neededWidth = Math.max(
          gInfo.width,
          dims.width + LAYOUT_CONSTANTS.GROUP_PADDING * 2,
          LAYOUT_CONSTANTS.GROUP_MIN_WIDTH,
        );
        const neededHeight = Math.max(
          gInfo.height,
          newBottom + LAYOUT_CONSTANTS.GROUP_PADDING,
          LAYOUT_CONSTANTS.GROUP_MIN_HEIGHT,
        );

        if (neededWidth > gInfo.width || neededHeight > gInfo.height) {
          await commands.node.resize(cmdCtx, {
            workspaceId: patch.workspaceId,
            nodeId: targetGroupId,
            width: neededWidth,
            height: neededHeight,
          });
          gInfo.width = neededWidth;
          gInfo.height = neededHeight;
        }
      } else {
        positionX = standaloneNextX;
        positionY = standaloneNextY;
        standaloneNextY += dims.height + LAYOUT_CONSTANTS.CARD_GAP;
      }

      // Entity resolution & creation
      let entityType: string | null = null;
      let entityId: string | null = null;
      let displayConfig: Record<string, unknown> | null = null;

      if (item.kind === "doc") {
        const docItem = item as BlueprintDocItem;
        displayConfig = {
          title: docItem.title,
          content: docItem.content,
        };
      } else if (item.kind === "focus") {
        // focus node has no entity
      } else if (item.kind === "decision") {
        const decisionItem = item as BlueprintDecisionItem;
        displayConfig = {
          question: decisionItem.question,
          description: decisionItem.description ?? "",
        };
      } else if (item.kind === "step") {
        const stepItem = item as BlueprintStepItem;
        displayConfig = {
          title: stepItem.title,
          description: stepItem.description ?? "",
        };
      } else if (item.kind === "task") {
        const taskItem = item as BlueprintTaskItem;
        entityType = "task";
        let projectId: string | null = null;
        if (taskItem.existingTaskId) {
          entityId = taskItem.existingTaskId;
        } else {
          if (taskItem.projectName) {
            if (options?.onResolveProject) {
              const res = await options.onResolveProject(taskItem.projectName);
              if (res) projectId = res;
            }
            if (!projectId) {
              const createdProj = await commands.project.create(cmdCtx, {
                name: taskItem.projectName,
              });
              projectId = createdProj.id;
              createdEntityIds.projects.add(projectId);
            }
          }
          const createdTask = await commands.task.create(cmdCtx, {
            content: taskItem.content,
            priority: taskItem.priority ?? 4,
            due_date: taskItem.dueDate ?? undefined,
            project_id: projectId ?? undefined,
          });
          entityId = createdTask.id;
          createdEntityIds.tasks.add(entityId);
        }
        if (entityId) linkedEntityIds.tasks.add(entityId);
        if (projectId) linkedEntityIds.projects.add(projectId);
      } else if (item.kind === "habit") {
        const habitItem = item as BlueprintHabitItem;
        entityType = "habit";
        if (habitItem.existingHabitId) {
          entityId = habitItem.existingHabitId;
        } else {
          let habitId: string | undefined;
          if (options?.onResolveHabit) {
            habitId = await options.onResolveHabit(habitItem.name);
          }
          if (!habitId) {
            const createdHabit = await commands.habit.create(cmdCtx, {
              name: habitItem.name,
              color: habitItem.color,
            });
            habitId = createdHabit.id;
            createdEntityIds.habits.add(habitId);
          }
          entityId = habitId;
        }
        if (entityId) linkedEntityIds.habits.add(entityId);
      } else if (item.kind === "project") {
        const projectItem = item as BlueprintProjectItem;
        entityType = "project";
        if (projectItem.existingProjectId) {
          entityId = projectItem.existingProjectId;
        } else {
          let projId: string | undefined;
          if (options?.onResolveProject) {
            projId = await options.onResolveProject(projectItem.name);
          }
          if (!projId) {
            const createdProj = await commands.project.create(cmdCtx, {
              name: projectItem.name,
              color: projectItem.color,
            });
            projId = createdProj.id;
            createdEntityIds.projects.add(projId);
          }
          entityId = projId;
        }
        if (entityId) linkedEntityIds.projects.add(entityId);
      }

      const createdNode = await commands.node.add(cmdCtx, {
        id: item.id,
        workspaceId: patch.workspaceId,
        kind: item.kind,
        entityType,
        entityId,
        position: { x: positionX, y: positionY },
        width: dims.width,
        height: dims.height,
        groupId: parentGroupId,
        displayConfig,
      });

      addedNodes.push(createdNode);
      addedNodeIdMap.set(item.id, createdNode.id);
      existingNodesById.set(createdNode.id, createdNode);
    }
  }

  // 9. Execute flow additions
  const addedEdges: WorkspaceEdge[] = [];
  if (patch.addFlows && patch.addFlows.length > 0) {
    for (const flow of patch.addFlows) {
      const sourceNodeId =
        addedNodeIdMap.get(flow.fromItemId) ?? flow.fromItemId;
      const targetNodeId = addedNodeIdMap.get(flow.toItemId) ?? flow.toItemId;

      const createdEdge = await commands.edge.add(cmdCtx, {
        id: `edge-${flow.fromItemId}-${flow.toItemId}`,
        workspaceId: patch.workspaceId,
        sourceNodeId,
        targetNodeId,
        label: flow.label ?? null,
        source_handle: flow.fromPort ?? null,
        target_handle: flow.toPort ?? null,
      });
      addedEdges.push(createdEdge);
    }
  }

  return {
    workspaceId: patch.workspaceId,
    addedNodes,
    removedNodeIds,
    updatedDocNodeIds,
    updatedDecisionNodeIds,
    updatedStepNodeIds,
    addedEdges,
    removedEdgeIds,
    itemNodeIds: Object.fromEntries(addedNodeIdMap),
    linkedEntityIds: {
      tasks: [...linkedEntityIds.tasks],
      habits: [...linkedEntityIds.habits],
      projects: [...linkedEntityIds.projects],
    },
    createdEntityIds: {
      tasks: [...createdEntityIds.tasks],
      habits: [...createdEntityIds.habits],
      projects: [...createdEntityIds.projects],
    },
  };
}
