import type { QueryClient } from "@tanstack/react-query";
import { workspaceCommands } from "@/lib/commands/workspace";
import { nodeCommands } from "@/lib/commands/node";
import { edgeCommands } from "@/lib/commands/edge";
import { taskCommands } from "@/lib/commands/task";
import { projectCommands } from "@/lib/commands/project";
import { habitCommands } from "@/lib/commands/habit";
import type {
  AddNodeInput,
  ResizeNodeInput,
  UpdateDecisionNodeInput,
  UpdateDocNodeInput,
  UpdateStepNodeInput,
  UpdateImageNodeInput,
  Workspace,
  WorkspaceEdge,
  WorkspaceNode,
} from "@/lib/types/workspace";
import type { CreateTaskInputWithClientId } from "@/lib/commands/task";
import type { CreateProjectCommandInput } from "@/lib/commands/project";
import type { CreateHabitInput } from "@/lib/mutations/habit";

export interface BlueprintCommandContext {
  readonly queryClient: QueryClient;
  readonly isGuestMode: boolean;
}

type NodeRemoval = { id: string; workspace_id: string };
type EdgeRemoval = { id: string; workspace_id: string };

/**
 * The semantic engines depend on this narrow command-shaped interface rather
 * than on a transport or database.  The default adapter is the application's
 * existing Domain Command funnel; tests and the local MCP mock can provide a
 * storage-backed implementation without creating a second semantic engine.
 */
export interface BlueprintCommandAdapters {
  workspace: {
    create: (
      ctx: BlueprintCommandContext,
      input: { name: string; color?: string },
    ) => Promise<Workspace>;
    delete: (ctx: BlueprintCommandContext, id: string) => Promise<void>;
  };
  node: {
    add: (
      ctx: BlueprintCommandContext,
      input: AddNodeInput,
    ) => Promise<WorkspaceNode>;
    resize: (
      ctx: BlueprintCommandContext,
      input: ResizeNodeInput,
    ) => Promise<void>;
    updateDocNode: (
      ctx: BlueprintCommandContext,
      input: UpdateDocNodeInput,
    ) => Promise<void>;
    updateDecisionNode: (
      ctx: BlueprintCommandContext,
      input: UpdateDecisionNodeInput,
    ) => Promise<void>;
    updateStepNode: (
      ctx: BlueprintCommandContext,
      input: UpdateStepNodeInput,
    ) => Promise<void>;
    updateImageNode?: (
      ctx: BlueprintCommandContext,
      input: UpdateImageNodeInput,
    ) => Promise<void>;
    remove: (ctx: BlueprintCommandContext, node: NodeRemoval) => Promise<void>;
  };
  edge: {
    add: (
      ctx: BlueprintCommandContext,
      input: Parameters<typeof edgeCommands.add>[1],
    ) => Promise<WorkspaceEdge>;
    remove: (ctx: BlueprintCommandContext, edge: EdgeRemoval) => Promise<void>;
  };
  task: {
    create: (
      ctx: BlueprintCommandContext,
      input: CreateTaskInputWithClientId,
    ) => ReturnType<typeof taskCommands.create>;
  };
  project: {
    create: (
      ctx: BlueprintCommandContext,
      input: CreateProjectCommandInput,
    ) => ReturnType<typeof projectCommands.create>;
  };
  habit: {
    create: (
      ctx: BlueprintCommandContext,
      input: CreateHabitInput,
    ) => ReturnType<typeof habitCommands.create>;
  };
  /** Best-effort cleanup for entities created only by one build operation. */
  compensate?: {
    task?: (ctx: BlueprintCommandContext, id: string) => Promise<unknown>;
    project?: (ctx: BlueprintCommandContext, id: string) => Promise<unknown>;
    habit?: (ctx: BlueprintCommandContext, id: string) => Promise<unknown>;
  };
}

/** The one production adapter: all writes still pass through Domain Commands. */
export const defaultBlueprintCommandAdapters: BlueprintCommandAdapters = {
  workspace: {
    create: workspaceCommands.create,
    delete: workspaceCommands.delete,
  },
  node: {
    add: nodeCommands.add,
    resize: nodeCommands.resize,
    updateDocNode: nodeCommands.updateDocNode,
    updateDecisionNode: nodeCommands.updateDecisionNode,
    updateStepNode: nodeCommands.updateStepNode,
    updateImageNode: nodeCommands.updateImageNode,
    remove: async (ctx, node) => {
      await nodeCommands.remove(ctx, node);
    },
  },
  edge: {
    add: edgeCommands.add,
    remove: edgeCommands.remove,
  },
  task: {
    create: taskCommands.create,
  },
  project: {
    create: projectCommands.create,
  },
  habit: {
    create: habitCommands.create,
  },
  compensate: {
    task: taskCommands.delete,
    project: projectCommands.delete,
    habit: habitCommands.delete,
  },
};
