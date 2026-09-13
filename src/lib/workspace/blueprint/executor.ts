import { QueryClient } from "@tanstack/react-query";
import type {
  BlueprintDocItem,
  BlueprintHabitItem,
  BlueprintProjectItem,
  BlueprintTaskItem,
  WorkspaceBlueprint,
} from "./types";
import { WorkspaceBlueprintSchema } from "./types";
import { compileBlueprintLayout, type LayoutOptions } from "./layout";
import { workspaceCommands } from "@/lib/commands/workspace";
import { nodeCommands } from "@/lib/commands/node";
import { edgeCommands } from "@/lib/commands/edge";
import { taskCommands } from "@/lib/commands/task";
import { projectCommands } from "@/lib/commands/project";
import { habitCommands } from "@/lib/commands/habit";
import type {
  Workspace,
  WorkspaceEdge,
  WorkspaceNode,
} from "@/lib/types/workspace";

export interface BuildOptions extends LayoutOptions {
  queryClient?: QueryClient;
  isGuestMode?: boolean;
  onResolveProject?: (name: string) => Promise<string | undefined>;
  onResolveHabit?: (name: string) => Promise<string | undefined>;
}

export interface BuildWorkspaceResult {
  workspaceId: string;
  nodeCount: number;
  edgeCount: number;
  workspace: Workspace;
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
}

/**
 * Validates blueprint and creates a full workspace canvas with all
 * sections, nodes, groups, and edges strictly using Domain Commands (ADR 0016).
 */
export async function buildWorkspaceFromBlueprint(
  blueprint: WorkspaceBlueprint,
  options?: BuildOptions,
): Promise<BuildWorkspaceResult> {
  // Validate schema
  WorkspaceBlueprintSchema.parse(blueprint);

  // Validate flow integrity
  const itemIds = new Set<string>();
  for (const section of blueprint.sections) {
    for (const item of section.items) {
      itemIds.add(item.id);
    }
  }

  if (blueprint.flows && blueprint.flows.length > 0) {
    for (const flow of blueprint.flows) {
      if (!itemIds.has(flow.fromItemId)) {
        throw new Error(
          `Invalid flow reference: fromItemId "${flow.fromItemId}" not found in blueprint items`,
        );
      }
      if (!itemIds.has(flow.toItemId)) {
        throw new Error(
          `Invalid flow reference: toItemId "${flow.toItemId}" not found in blueprint items`,
        );
      }
    }
  }

  // Compile layout
  const layout = compileBlueprintLayout(blueprint, options);

  // Prepare context
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

  // 1. Create workspace
  const workspace = await workspaceCommands.create(cmdCtx, {
    name: blueprint.name,
    color: blueprint.color,
  });

  const workspaceId = workspace.id;
  const createdNodes: WorkspaceNode[] = [];
  const createdEdges: WorkspaceEdge[] = [];
  const itemIdToNodeId = new Map<string, string>();
  const projectNameToId = new Map<string, string>();

  try {
    // 2. Pre-scan for existing or newly defined project items
    for (const section of blueprint.sections) {
      for (const item of section.items) {
        if (item.kind === "project") {
          if (item.existingProjectId) {
            projectNameToId.set(item.name, item.existingProjectId);
          }
        }
      }
    }

    // 3. Create all nodes in layout order (groups first, then members/standalones)
    for (const layoutNode of layout.nodes) {
      if (layoutNode.kind === "group") {
        const groupNode = await nodeCommands.add(cmdCtx, {
          id: layoutNode.id,
          workspaceId,
          kind: "group",
          entityType: null,
          entityId: null,
          position: layoutNode.position,
          width: layoutNode.width,
          height: layoutNode.height,
          groupId: null,
          displayConfig: {
            title: layoutNode.title ?? "",
            color: layoutNode.color,
          },
        });
        createdNodes.push(groupNode);
        itemIdToNodeId.set(layoutNode.id, groupNode.id);
        continue;
      }

      if (layoutNode.kind === "doc") {
        const docItem = layoutNode.item as BlueprintDocItem | undefined;
        const docNode = await nodeCommands.add(cmdCtx, {
          id: layoutNode.id,
          workspaceId,
          kind: "doc",
          entityType: null,
          entityId: null,
          position: layoutNode.position,
          width: layoutNode.width,
          height: layoutNode.height,
          groupId: layoutNode.groupId
            ? (itemIdToNodeId.get(layoutNode.groupId) ?? layoutNode.groupId)
            : null,
          displayConfig: {
            title: docItem?.title ?? layoutNode.title ?? "",
            content: docItem?.content ?? "",
            color: layoutNode.color,
          },
        });
        createdNodes.push(docNode);
        itemIdToNodeId.set(layoutNode.id, docNode.id);
        continue;
      }

      if (layoutNode.kind === "focus") {
        const focusNode = await nodeCommands.add(cmdCtx, {
          id: layoutNode.id,
          workspaceId,
          kind: "focus",
          entityType: null,
          entityId: null,
          position: layoutNode.position,
          width: layoutNode.width,
          height: layoutNode.height,
          groupId: layoutNode.groupId
            ? (itemIdToNodeId.get(layoutNode.groupId) ?? layoutNode.groupId)
            : null,
          displayConfig: null,
        });
        createdNodes.push(focusNode);
        itemIdToNodeId.set(layoutNode.id, focusNode.id);
        continue;
      }

      if (layoutNode.kind === "task") {
        const taskItem = layoutNode.item as BlueprintTaskItem;
        let taskId: string;

        if (taskItem?.existingTaskId) {
          taskId = taskItem.existingTaskId;
        } else {
          let projectId: string | null = null;
          if (taskItem?.projectName) {
            if (projectNameToId.has(taskItem.projectName)) {
              projectId = projectNameToId.get(taskItem.projectName)!;
            } else if (options?.onResolveProject) {
              const resolved = await options.onResolveProject(
                taskItem.projectName,
              );
              if (resolved) {
                projectId = resolved;
                projectNameToId.set(taskItem.projectName, projectId);
              }
            }

            if (!projectId) {
              const createdProject = await projectCommands.create(cmdCtx, {
                name: taskItem.projectName,
              });
              projectId = createdProject.id;
              projectNameToId.set(taskItem.projectName, projectId);
            }
          }

          const createdTask = await taskCommands.create(cmdCtx, {
            content: taskItem.content,
            priority: taskItem.priority ?? 4,
            due_date: taskItem.dueDate ?? undefined,
            project_id: projectId ?? undefined,
          });
          taskId = createdTask.id;
        }

        const taskNode = await nodeCommands.add(cmdCtx, {
          id: layoutNode.id,
          workspaceId,
          kind: "task",
          entityType: "task",
          entityId: taskId,
          position: layoutNode.position,
          width: layoutNode.width,
          height: layoutNode.height,
          groupId: layoutNode.groupId
            ? (itemIdToNodeId.get(layoutNode.groupId) ?? layoutNode.groupId)
            : null,
          displayConfig: null,
        });
        createdNodes.push(taskNode);
        itemIdToNodeId.set(layoutNode.id, taskNode.id);
        continue;
      }

      if (layoutNode.kind === "habit") {
        const habitItem = layoutNode.item as BlueprintHabitItem;
        let habitId: string;

        if (habitItem?.existingHabitId) {
          habitId = habitItem.existingHabitId;
        } else {
          if (options?.onResolveHabit) {
            const resolved = await options.onResolveHabit(habitItem.name);
            if (resolved) {
              habitId = resolved;
            } else {
              const createdHabit = await habitCommands.create(cmdCtx, {
                name: habitItem.name,
                color: habitItem.color,
              });
              habitId = createdHabit.id;
            }
          } else {
            const createdHabit = await habitCommands.create(cmdCtx, {
              name: habitItem.name,
              color: habitItem.color,
            });
            habitId = createdHabit.id;
          }
        }

        const habitNode = await nodeCommands.add(cmdCtx, {
          id: layoutNode.id,
          workspaceId,
          kind: "habit",
          entityType: "habit",
          entityId: habitId,
          position: layoutNode.position,
          width: layoutNode.width,
          height: layoutNode.height,
          groupId: layoutNode.groupId
            ? (itemIdToNodeId.get(layoutNode.groupId) ?? layoutNode.groupId)
            : null,
          displayConfig: null,
        });
        createdNodes.push(habitNode);
        itemIdToNodeId.set(layoutNode.id, habitNode.id);
        continue;
      }

      if (layoutNode.kind === "project") {
        const projectItem = layoutNode.item as BlueprintProjectItem;
        let projectId: string;

        if (projectItem?.existingProjectId) {
          projectId = projectItem.existingProjectId;
          projectNameToId.set(projectItem.name, projectId);
        } else if (projectNameToId.has(projectItem.name)) {
          projectId = projectNameToId.get(projectItem.name)!;
        } else {
          const createdProject = await projectCommands.create(cmdCtx, {
            name: projectItem.name,
            color: projectItem.color,
          });
          projectId = createdProject.id;
          projectNameToId.set(projectItem.name, projectId);
        }

        const projectNode = await nodeCommands.add(cmdCtx, {
          id: layoutNode.id,
          workspaceId,
          kind: "project",
          entityType: "project",
          entityId: projectId,
          position: layoutNode.position,
          width: layoutNode.width,
          height: layoutNode.height,
          groupId: layoutNode.groupId
            ? (itemIdToNodeId.get(layoutNode.groupId) ?? layoutNode.groupId)
            : null,
          displayConfig: null,
        });
        createdNodes.push(projectNode);
        itemIdToNodeId.set(layoutNode.id, projectNode.id);
        continue;
      }
    }

    // 4. Create all edges
    for (const edge of layout.edges) {
      const sourceNodeId =
        itemIdToNodeId.get(edge.sourceNodeId) ?? edge.sourceNodeId;
      const targetNodeId =
        itemIdToNodeId.get(edge.targetNodeId) ?? edge.targetNodeId;

      const createdEdge = await edgeCommands.add(cmdCtx, {
        id: edge.id || crypto.randomUUID(),
        workspaceId,
        sourceNodeId,
        targetNodeId,
      });
      createdEdges.push(createdEdge);
    }

    return {
      workspaceId,
      nodeCount: createdNodes.length,
      edgeCount: createdEdges.length,
      workspace,
      nodes: createdNodes,
      edges: createdEdges,
    };
  } catch (error) {
    // Roll back created workspace
    try {
      await workspaceCommands.delete(cmdCtx, workspaceId);
    } catch (rollbackError) {
      // eslint-disable-next-line no-restricted-syntax
      console.error(
        "Failed to clean up workspace during rollback:",
        rollbackError,
      );
    }
    throw error;
  }
}
