import { QueryClient } from "@tanstack/react-query";
import type {
  BlueprintDecisionItem,
  BlueprintDocItem,
  BlueprintHabitItem,
  BlueprintImageItem,
  BlueprintProjectItem,
  BlueprintStepItem,
  BlueprintTaskItem,
  WorkspaceBlueprint,
} from "./types";
import { WorkspaceBlueprintSchema } from "./types";
import { compileBlueprintLayout, type LayoutOptions } from "./layout";
import type {
  Workspace,
  WorkspaceEdge,
  WorkspaceNode,
} from "@/lib/types/workspace";
import {
  defaultBlueprintCommandAdapters,
  type BlueprintCommandAdapters,
} from "./commands";

export interface BuildOptions extends LayoutOptions {
  queryClient?: QueryClient;
  isGuestMode?: boolean;
  onResolveProject?: (name: string) => Promise<string | undefined>;
  onResolveHabit?: (name: string) => Promise<string | undefined>;
  onResolveVisualAsset?: (
    assetId: string,
    workspaceId: string,
    versionId?: string,
  ) => Promise<{ assetId: string; versionId?: string } | null | undefined>;
  commandAdapters?: BlueprintCommandAdapters;
}

export interface BuildWorkspaceResult {
  workspaceId: string;
  nodeCount: number;
  edgeCount: number;
  workspace: Workspace;
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
  /** Maps every semantic blueprint item/section id to its persisted node id. */
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

export class BlueprintCompensationError extends Error {
  readonly workspaceId: string;
  readonly retainedEntityIds: BuildWorkspaceResult["createdEntityIds"];
  readonly compensationErrors: string[];

  constructor(
    message: string,
    input: {
      workspaceId: string;
      retainedEntityIds: BuildWorkspaceResult["createdEntityIds"];
      compensationErrors: string[];
    },
  ) {
    super(message);
    this.name = "BlueprintCompensationError";
    this.workspaceId = input.workspaceId;
    this.retainedEntityIds = input.retainedEntityIds;
    this.compensationErrors = input.compensationErrors;
  }
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

  if (itemIds.size !== blueprint.sections.flatMap((s) => s.items).length) {
    throw new Error("Blueprint item IDs must be unique");
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
  const commands = options?.commandAdapters ?? defaultBlueprintCommandAdapters;

  // 1. Create workspace
  const workspace = await commands.workspace.create(cmdCtx, {
    name: blueprint.name,
    color: blueprint.color,
  });

  const workspaceId = workspace.id;
  const createdNodes: WorkspaceNode[] = [];
  const createdEdges: WorkspaceEdge[] = [];
  const itemIdToNodeId = new Map<string, string>();
  const projectNameToId = new Map<string, string>();
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
        const groupNode = await commands.node.add(cmdCtx, {
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
        const docNode = await commands.node.add(cmdCtx, {
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
        const focusNode = await commands.node.add(cmdCtx, {
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

      if (layoutNode.kind === "decision") {
        const decisionItem = layoutNode.item as
          BlueprintDecisionItem | undefined;
        const decisionNode = await commands.node.add(cmdCtx, {
          id: layoutNode.id,
          workspaceId,
          kind: "decision",
          entityType: null,
          entityId: null,
          position: layoutNode.position,
          width: layoutNode.width,
          height: layoutNode.height,
          groupId: layoutNode.groupId
            ? (itemIdToNodeId.get(layoutNode.groupId) ?? layoutNode.groupId)
            : null,
          displayConfig: {
            question: decisionItem?.question ?? layoutNode.title ?? "",
            description: decisionItem?.description ?? "",
          },
        });
        createdNodes.push(decisionNode);
        itemIdToNodeId.set(layoutNode.id, decisionNode.id);
        continue;
      }

      if (layoutNode.kind === "step") {
        const stepItem = layoutNode.item as BlueprintStepItem | undefined;
        const stepNode = await commands.node.add(cmdCtx, {
          id: layoutNode.id,
          workspaceId,
          kind: "step",
          entityType: null,
          entityId: null,
          position: layoutNode.position,
          width: layoutNode.width,
          height: layoutNode.height,
          groupId: layoutNode.groupId
            ? (itemIdToNodeId.get(layoutNode.groupId) ?? layoutNode.groupId)
            : null,
          displayConfig: {
            title: stepItem?.title ?? layoutNode.title ?? "",
            description: stepItem?.description ?? "",
          },
        });
        createdNodes.push(stepNode);
        itemIdToNodeId.set(layoutNode.id, stepNode.id);
        continue;
      }

      if (layoutNode.kind === "image") {
        const imageItem = layoutNode.item as BlueprintImageItem | undefined;
        if (!imageItem?.assetId) {
          throw new Error(`Image item "${layoutNode.id}" is missing assetId`);
        }
        const resolved = options?.onResolveVisualAsset
          ? await options.onResolveVisualAsset(
              imageItem.assetId,
              workspaceId,
              imageItem.versionId,
            )
          : { assetId: imageItem.assetId, versionId: imageItem.versionId };
        if (!resolved) {
          throw new Error(
            `Visual asset "${imageItem.assetId}" is not available to this Workspace`,
          );
        }
        const imageNode = await commands.node.add(cmdCtx, {
          id: layoutNode.id,
          workspaceId,
          kind: "image",
          entityType: "visual_asset",
          entityId: resolved.assetId,
          position: layoutNode.position,
          width: layoutNode.width,
          height: layoutNode.height,
          groupId: layoutNode.groupId
            ? (itemIdToNodeId.get(layoutNode.groupId) ?? layoutNode.groupId)
            : null,
          displayConfig: {
            title: imageItem.title ?? layoutNode.title ?? "",
            role: imageItem.role ?? "",
            altText: imageItem.altText ?? "",
            versionId: resolved.versionId ?? null,
          },
        });
        createdNodes.push(imageNode);
        itemIdToNodeId.set(layoutNode.id, imageNode.id);
        continue;
      }

      if (layoutNode.kind === "task") {
        const taskItem = layoutNode.item as BlueprintTaskItem;
        let taskId: string;
        let projectId: string | null = null;

        if (taskItem?.existingTaskId) {
          taskId = taskItem.existingTaskId;
        } else {
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
              const createdProject = await commands.project.create(cmdCtx, {
                name: taskItem.projectName,
              });
              projectId = createdProject.id;
              projectNameToId.set(taskItem.projectName, projectId);
              createdEntityIds.projects.add(projectId);
            }
          }

          const createdTask = await commands.task.create(cmdCtx, {
            content: taskItem.content,
            priority: taskItem.priority ?? 4,
            due_date: taskItem.dueDate ?? undefined,
            project_id: projectId ?? undefined,
          });
          taskId = createdTask.id;
          createdEntityIds.tasks.add(taskId);
        }

        linkedEntityIds.tasks.add(taskId);
        if (projectId) linkedEntityIds.projects.add(projectId);

        const taskNode = await commands.node.add(cmdCtx, {
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
              const createdHabit = await commands.habit.create(cmdCtx, {
                name: habitItem.name,
                color: habitItem.color,
              });
              habitId = createdHabit.id;
              createdEntityIds.habits.add(habitId);
            }
          } else {
            const createdHabit = await commands.habit.create(cmdCtx, {
              name: habitItem.name,
              color: habitItem.color,
            });
            habitId = createdHabit.id;
            createdEntityIds.habits.add(habitId);
          }
        }

        linkedEntityIds.habits.add(habitId);

        const habitNode = await commands.node.add(cmdCtx, {
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
          const createdProject = await commands.project.create(cmdCtx, {
            name: projectItem.name,
            color: projectItem.color,
          });
          projectId = createdProject.id;
          projectNameToId.set(projectItem.name, projectId);
          createdEntityIds.projects.add(projectId);
        }

        linkedEntityIds.projects.add(projectId);

        const projectNode = await commands.node.add(cmdCtx, {
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

      const createdEdge = await commands.edge.add(cmdCtx, {
        id: edge.id || crypto.randomUUID(),
        workspaceId,
        sourceNodeId,
        targetNodeId,
        label: edge.label ?? null,
        source_handle: edge.sourceHandle ?? null,
        target_handle: edge.targetHandle ?? null,
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
      itemNodeIds: Object.fromEntries(itemIdToNodeId),
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
  } catch (error) {
    const compensationErrors: string[] = [];
    const retainedEntityIds: BuildWorkspaceResult["createdEntityIds"] = {
      tasks: [],
      habits: [],
      projects: [],
    };

    // Roll back the workspace first. Its node/edge rows are arrangement data
    // and cascade in both the cloud schema and the MCP mock.
    try {
      await commands.workspace.delete(cmdCtx, workspaceId);
    } catch (rollbackError) {
      compensationErrors.push(
        `workspace: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
      );
    }

    // Entities are soft-linked by nodes, so they need explicit best-effort
    // compensation. Pre-existing/reused references are never in this set.
    for (const id of createdEntityIds.tasks) {
      try {
        if (!commands.compensate?.task) {
          throw new Error("task compensation adapter is unavailable");
        }
        await commands.compensate.task(cmdCtx, id);
      } catch (cleanupError) {
        retainedEntityIds.tasks.push(id);
        compensationErrors.push(
          `task:${id}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
      }
    }
    for (const id of createdEntityIds.habits) {
      try {
        if (!commands.compensate?.habit) {
          throw new Error("habit compensation adapter is unavailable");
        }
        await commands.compensate.habit(cmdCtx, id);
      } catch (cleanupError) {
        retainedEntityIds.habits.push(id);
        compensationErrors.push(
          `habit:${id}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
      }
    }
    for (const id of createdEntityIds.projects) {
      try {
        if (!commands.compensate?.project) {
          throw new Error("project compensation adapter is unavailable");
        }
        await commands.compensate.project(cmdCtx, id);
      } catch (cleanupError) {
        retainedEntityIds.projects.push(id);
        compensationErrors.push(
          `project:${id}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
      }
    }

    if (compensationErrors.length > 0) {
      throw new BlueprintCompensationError(
        "Workspace build failed and compensation was incomplete.",
        {
          workspaceId,
          retainedEntityIds,
          compensationErrors,
        },
      );
    }

    throw error;
  }
}
