import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { setClient } from "../src/lib/supabase/client";
import {
  WorkspaceBlueprintSchema,
  BlueprintPatchSchema,
  type WorkspaceBlueprint,
  type BlueprintPatch,
  type BlueprintDocItem,
} from "../src/lib/workspace/blueprint/types";
import {
  compileBlueprintLayout,
  getItemDimensions,
} from "../src/lib/workspace/blueprint/layout";
import { buildWorkspaceFromBlueprint } from "../src/lib/workspace/blueprint/executor";
import {
  decompileWorkspaceToSnapshot,
  formatSnapshotToMarkdown,
} from "../src/lib/workspace/blueprint/decompiler";
import { applyWorkspacePatch } from "../src/lib/workspace/blueprint/patcher";
import { workspaceMutations } from "../src/lib/mutations/workspace";
import { mockStore } from "../src/lib/mock/mock-store";
import type {
  Workspace,
  WorkspaceNode,
  WorkspaceEdge,
} from "../src/lib/types/workspace";
import type { Task, Project } from "../src/lib/types/task";
import type { Habit } from "../src/lib/types/habit";

export interface McpServerOptions {
  supabaseUrl?: string;
  supabaseKey?: string;
  useMockFallback?: boolean;
  initialWorkspaces?: Workspace[];
  initialNodes?: WorkspaceNode[];
  initialEdges?: WorkspaceEdge[];
  initialTasks?: Task[];
  initialProjects?: Project[];
  initialHabits?: Habit[];
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    if (
      "message" in err &&
      typeof (err as { message: unknown }).message === "string"
    ) {
      return (err as { message: string }).message;
    }
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

/**
 * Creates and configures the Kagelin MCP Server instance.
 */
export function createKagelinMcpServer(
  options: McpServerOptions = {},
): McpServer {
  const server = new McpServer({
    name: "kagelin-workspace-ai-builder",
    version: "1.0.0",
  });

  const useMockFallback =
    options.useMockFallback ||
    process.env.KAGELIN_MOCK_MODE === "true" ||
    (!process.env.NEXT_PUBLIC_SUPABASE_URL && !options.supabaseUrl);

  const supabaseUrl =
    options.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    options.supabaseKey ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let nodeSupabaseClient: SupabaseClient | null = null;
  if (!useMockFallback && supabaseUrl && supabaseKey) {
    nodeSupabaseClient = createSupabaseClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    setClient(nodeSupabaseClient);
  }

  let authPromise: Promise<void> | null = null;
  async function ensureAuthenticated() {
    if (useMockFallback || !nodeSupabaseClient) return;
    if (!authPromise) {
      authPromise = (async () => {
        const localUserId =
          process.env.NEXT_PUBLIC_LOCAL_USER_ID ||
          process.env.KAGELIN_MCP_USER_ID;
        const isLocalSingleUser =
          process.env.NEXT_PUBLIC_LOCAL_SINGLE_USER === "true";
        const hasSecretKey = Boolean(process.env.SUPABASE_SECRET_KEY);

        // In local single-user mode or with secret key, bind directly to local user ID
        // without requiring remote password sign-in.
        if ((isLocalSingleUser || hasSecretKey) && localUserId) {
          process.env.KAGELIN_MCP_USER_ID = localUserId;
          return;
        }

        const client = nodeSupabaseClient!;
        const {
          data: { session },
        } = await client.auth.getSession();
        if (session?.user) {
          process.env.KAGELIN_MCP_USER_ID = session.user.id;
          return;
        }

        const email =
          process.env.KAGELIN_MCP_USER_EMAIL ||
          process.env.NEXT_PUBLIC_LOCAL_USER_EMAIL ||
          "mcp-tester@kagelin.local";
        const password =
          process.env.KAGELIN_MCP_USER_PASSWORD ||
          process.env.NEXT_PUBLIC_LOCAL_USER_PASSWORD ||
          "tester123456";

        const { data: signInData, error: signInError } =
          await client.auth.signInWithPassword({
            email,
            password,
          });

        if (signInData?.user) {
          process.env.KAGELIN_MCP_USER_ID = signInData.user.id;
          console.error(
            `[Kagelin MCP] Authenticated as ${email} (${signInData.user.id})`,
          );
          return;
        }

        if (
          signInError &&
          (signInError.message.includes("Invalid login credentials") ||
            signInError.message.includes("Email not confirmed"))
        ) {
          console.error(`[Kagelin MCP] Signing up MCP test user: ${email}...`);
          const { data: signUpData, error: signUpError } =
            await client.auth.signUp({
              email,
              password,
            });

          if (signUpError) {
            console.error(
              `[Kagelin MCP] Sign up error: ${signUpError.message}`,
            );
            throw new Error(
              `Failed to authenticate MCP user: ${signUpError.message}`,
            );
          }

          if (signUpData.user) {
            process.env.KAGELIN_MCP_USER_ID = signUpData.user.id;
          }

          if (!signUpData.session) {
            const { data: retryData, error: retryErr } =
              await client.auth.signInWithPassword({
                email,
                password,
              });
            if (retryErr) {
              throw new Error(
                `Failed to sign in after sign up: ${retryErr.message}`,
              );
            }
            if (retryData.user) {
              process.env.KAGELIN_MCP_USER_ID = retryData.user.id;
            }
          }
          console.error(
            `[Kagelin MCP] User ${email} registered and authenticated.`,
          );
        } else if (signInError) {
          throw new Error(`Failed to sign in: ${signInError.message}`);
        }
      })();
    }
    await authPromise;
  }

  // In-memory mock storage for fallback/offline testing
  const mockWorkspaces: Workspace[] = options.initialWorkspaces
    ? [...options.initialWorkspaces]
    : [];
  const mockNodes: WorkspaceNode[] = options.initialNodes
    ? [...options.initialNodes]
    : [];
  const mockEdges: WorkspaceEdge[] = options.initialEdges
    ? [...options.initialEdges]
    : [];
  const mockTasks: Task[] = options.initialTasks
    ? [...options.initialTasks]
    : [];
  const mockProjects: Project[] = options.initialProjects
    ? [...options.initialProjects]
    : [];
  const mockHabits: Habit[] = options.initialHabits
    ? [...options.initialHabits]
    : [];

  // ==========================================
  // Tool 1: list_workspaces
  // ==========================================
  server.tool(
    "list_workspaces",
    "List all workspaces with id, name, color, and node count.",
    {},
    async () => {
      try {
        let workspacesWithCount: Array<{
          id: string;
          name: string;
          color?: string | null;
          nodeCount: number;
        }> = [];

        if (useMockFallback) {
          workspacesWithCount = mockWorkspaces.map((w) => {
            const count = mockNodes.filter(
              (n) => n.workspace_id === w.id,
            ).length;
            return {
              id: w.id,
              name: w.name,
              color: w.color,
              nodeCount: count,
            };
          });
        } else {
          await ensureAuthenticated();
          const list = await workspaceMutations.list();
          for (const w of list) {
            const nodes = await workspaceMutations.listNodes(w.id);
            workspacesWithCount.push({
              id: w.id,
              name: w.name,
              color: w.color,
              nodeCount: nodes.length,
            });
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { workspaces: workspacesWithCount },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: getErrorMessage(err) }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ==========================================
  // Tool 2: inspect_app_context
  // ==========================================
  server.tool(
    "inspect_app_context",
    "Inspect user's existing projects, habits, and recent tasks to inform intelligent entity reuse.",
    {
      limit: z
        .number()
        .optional()
        .describe("Max number of recent tasks to return (default: 20)"),
    },
    async ({ limit = 20 }) => {
      try {
        let projects: Array<{ id: string; name: string; color: string }> = [];
        let habits: Array<{ id: string; name: string; color?: string }> = [];
        let tasks: Array<{
          id: string;
          content: string;
          priority?: number;
          due_date?: string | null;
          is_completed: boolean;
          project_id?: string | null;
        }> = [];

        if (useMockFallback) {
          projects = mockProjects.map((p) => ({
            id: p.id,
            name: p.name,
            color: p.color,
          }));
          habits = mockHabits.map((h) => ({
            id: h.id,
            name: h.name,
            color: h.color,
          }));
          tasks = mockTasks.slice(0, limit).map((t) => ({
            id: t.id,
            content: t.content,
            priority: t.priority,
            due_date: t.due_date,
            is_completed: t.is_completed,
            project_id: t.project_id,
          }));
        } else {
          await ensureAuthenticated();
          if (nodeSupabaseClient) {
            const { data: dbProjects } = await nodeSupabaseClient
              .from("projects")
              .select("id, name, color")
              .order("name", { ascending: true })
              .limit(1000);
            projects = (dbProjects ?? []).map(
              (p: { id: string; name: string; color: string }) => ({
                id: p.id,
                name: p.name,
                color: p.color,
              }),
            );

            const { data: dbHabits } = await nodeSupabaseClient
              .from("habits")
              .select("id, name, color")
              .order("name", { ascending: true })
              .limit(1000);
            habits = (dbHabits ?? []).map(
              (h: { id: string; name: string; color?: string }) => ({
                id: h.id,
                name: h.name,
                color: h.color,
              }),
            );

            const { data: dbTasks } = await nodeSupabaseClient
              .from("tasks")
              .select(
                "id, content, priority, due_date, is_completed, project_id",
              )
              .order("created_at", { ascending: false })
              .limit(limit);
            tasks = (dbTasks ?? []).map(
              (t: {
                id: string;
                content: string;
                priority?: number;
                due_date?: string | null;
                is_completed: boolean;
                project_id?: string | null;
              }) => ({
                id: t.id,
                content: t.content,
                priority: t.priority,
                due_date: t.due_date,
                is_completed: t.is_completed,
                project_id: t.project_id,
              }),
            );
          } else {
            const guestProjects = mockStore.getProjects();
            projects = guestProjects.map((p) => ({
              id: p.id,
              name: p.name,
              color: p.color,
            }));
            const guestHabits = mockStore.getHabits();
            habits = guestHabits.map((h) => ({
              id: h.id,
              name: h.name,
              color: h.color,
            }));
            const guestTasks = mockStore.getTasks();
            tasks = guestTasks.slice(0, limit).map((t) => ({
              id: t.id,
              content: t.content,
              priority: t.priority,
              due_date: t.due_date,
              is_completed: t.is_completed,
              project_id: t.project_id,
            }));
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  projects,
                  habits,
                  recentTasks: tasks,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: getErrorMessage(err) }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ==========================================
  // Tool 3: get_workspace_blueprint
  // ==========================================
  server.tool(
    "get_workspace_blueprint",
    "Get the semantic blueprint snapshot of a workspace (both markdown report and structured data).",
    {
      workspaceId: z.string().min(1).describe("The workspace ID to inspect"),
    },
    async ({ workspaceId }) => {
      try {
        if (useMockFallback) {
          const workspace = mockWorkspaces.find((w) => w.id === workspaceId);
          if (!workspace) {
            throw new Error(`Workspace "${workspaceId}" not found`);
          }
          const nodes = mockNodes.filter((n) => n.workspace_id === workspaceId);
          const edges = mockEdges.filter((e) => e.workspace_id === workspaceId);

          const snapshot = await decompileWorkspaceToSnapshot(workspaceId, {
            workspace,
            nodes,
            edges,
            getTask: (id) => mockTasks.find((t) => t.id === id) ?? null,
            getProject: (id) => mockProjects.find((p) => p.id === id) ?? null,
            getHabit: (id) => mockHabits.find((h) => h.id === id) ?? null,
          });

          const markdown = formatSnapshotToMarkdown(snapshot);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ markdown, snapshot }, null, 2),
              },
            ],
          };
        }

        await ensureAuthenticated();
        const snapshot = await decompileWorkspaceToSnapshot(workspaceId);
        const markdown = formatSnapshotToMarkdown(snapshot);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ markdown, snapshot }, null, 2),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: getErrorMessage(err) }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ==========================================
  // Tool 4: build_workspace
  // ==========================================
  server.tool(
    "build_workspace",
    "Compile a semantic workspace blueprint and create all canvas nodes, groups, and connections. Supported node kinds: 'doc' (Markdown card/SOP/Prompt), 'task' (actionable item with priority/dueDate/existingTaskId), 'habit' (daily routine with streak), 'project' (epic board with progress bar), 'focus' (pomodoro singleton timer lens). Sections with isGroup:true render visual container frames.",
    {
      blueprint: WorkspaceBlueprintSchema.optional(),
      name: z.string().optional(),
      color: z.string().optional(),
      sections: z.array(z.unknown()).optional(),
      flows: z.array(z.unknown()).optional(),
    },
    async (args) => {
      try {
        let blueprint: WorkspaceBlueprint;
        if (args.blueprint) {
          blueprint = WorkspaceBlueprintSchema.parse(args.blueprint);
        } else {
          blueprint = WorkspaceBlueprintSchema.parse({
            name: args.name,
            color: args.color,
            sections: args.sections,
            flows: args.flows,
          });
        }

        if (useMockFallback) {
          // Validate flow integrity
          const itemIds = new Set<string>();
          for (const s of blueprint.sections) {
            for (const item of s.items) {
              itemIds.add(item.id);
            }
          }
          if (blueprint.flows) {
            for (const f of blueprint.flows) {
              if (!itemIds.has(f.fromItemId) || !itemIds.has(f.toItemId)) {
                throw new Error("Invalid flow reference in blueprint");
              }
            }
          }

          const layout = compileBlueprintLayout(blueprint);
          const workspaceId = `ws-mock-${Date.now()}`;
          const newWorkspace: Workspace = {
            id: workspaceId,
            name: blueprint.name,
            color: blueprint.color ?? null,
            user_id: "mock-user",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          mockWorkspaces.push(newWorkspace);

          const addedNodes: WorkspaceNode[] = [];
          for (const lNode of layout.nodes) {
            const node: WorkspaceNode = {
              id: lNode.id,
              workspace_id: workspaceId,
              user_id: "mock-user",
              kind: lNode.kind,
              entity_type:
                lNode.kind === "task" ||
                lNode.kind === "habit" ||
                lNode.kind === "project"
                  ? lNode.kind
                  : null,
              entity_id: lNode.item?.id ?? null,
              position_x: lNode.position.x,
              position_y: lNode.position.y,
              width: lNode.width,
              height: lNode.height,
              group_id: lNode.groupId ?? null,
              display_config:
                lNode.kind === "doc"
                  ? {
                      title: lNode.title,
                      content: (lNode.item as BlueprintDocItem)?.content,
                    }
                  : lNode.kind === "group"
                    ? { title: lNode.title, color: lNode.color }
                    : null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            mockNodes.push(node);
            addedNodes.push(node);
          }

          const addedEdges: WorkspaceEdge[] = [];
          for (const lEdge of layout.edges) {
            const edge: WorkspaceEdge = {
              id: lEdge.id,
              workspace_id: workspaceId,
              user_id: "mock-user",
              source_node_id: lEdge.sourceNodeId,
              target_node_id: lEdge.targetNodeId,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            mockEdges.push(edge);
            addedEdges.push(edge);
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    workspaceId,
                    nodeCount: addedNodes.length,
                    edgeCount: addedEdges.length,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        await ensureAuthenticated();
        const result = await buildWorkspaceFromBlueprint(blueprint);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  workspaceId: result.workspaceId,
                  nodeCount: result.nodeCount,
                  edgeCount: result.edgeCount,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: getErrorMessage(err) }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ==========================================
  // Tool 5: patch_workspace
  // ==========================================
  server.tool(
    "patch_workspace",
    "Apply incremental semantic additions, updates, deletions, and connections to an existing workspace without moving untouched cards. Supports addItems (doc/task/habit/project/focus), removeNodeIds, updateDocs ({nodeId, title?, content?}), addFlows ({fromItemId, toItemId}), removeEdgeIds.",
    {
      patch: BlueprintPatchSchema.optional(),
      workspaceId: z.string().optional(),
      addItems: z.array(z.unknown()).optional(),
      removeNodeIds: z.array(z.string()).optional(),
      updateDocs: z.array(z.unknown()).optional(),
      addFlows: z.array(z.unknown()).optional(),
      removeEdgeIds: z.array(z.string()).optional(),
    },
    async (args) => {
      try {
        let patch: BlueprintPatch;
        if (args.patch) {
          patch = BlueprintPatchSchema.parse(args.patch);
        } else {
          patch = BlueprintPatchSchema.parse({
            workspaceId: args.workspaceId,
            addItems: args.addItems,
            removeNodeIds: args.removeNodeIds,
            updateDocs: args.updateDocs,
            addFlows: args.addFlows,
            removeEdgeIds: args.removeEdgeIds,
          });
        }

        if (useMockFallback) {
          const workspaceNodes = mockNodes.filter(
            (n) => n.workspace_id === patch.workspaceId,
          );

          // Apply doc updates
          const updatedDocNodeIds: string[] = [];
          if (patch.updateDocs) {
            for (const u of patch.updateDocs) {
              const node = workspaceNodes.find((n) => n.id === u.nodeId);
              if (!node || node.kind !== "doc") {
                throw new Error(`Doc node ${u.nodeId} not found`);
              }
              node.display_config = {
                ...(node.display_config || {}),
                ...(u.title !== undefined ? { title: u.title } : {}),
                ...(u.content !== undefined ? { content: u.content } : {}),
              };
              updatedDocNodeIds.push(u.nodeId);
            }
          }

          // Apply node removals
          const removedNodeIds: string[] = [];
          if (patch.removeNodeIds) {
            for (const id of patch.removeNodeIds) {
              const idx = mockNodes.findIndex((n) => n.id === id);
              if (idx !== -1) {
                mockNodes.splice(idx, 1);
                removedNodeIds.push(id);
              }
            }
          }

          // Apply edge removals
          const removedEdgeIds: string[] = [];
          if (patch.removeEdgeIds) {
            for (const id of patch.removeEdgeIds) {
              const idx = mockEdges.findIndex((e) => e.id === id);
              if (idx !== -1) {
                mockEdges.splice(idx, 1);
                removedEdgeIds.push(id);
              }
            }
          }

          // Apply additions
          const addedNodes: WorkspaceNode[] = [];
          if (patch.addItems) {
            for (const addItem of patch.addItems) {
              const item = addItem.item;
              const dims = getItemDimensions(item);
              const newNode: WorkspaceNode = {
                id: item.id,
                workspace_id: patch.workspaceId,
                user_id: "mock-user",
                kind: item.kind,
                entity_type:
                  item.kind === "task" ||
                  item.kind === "habit" ||
                  item.kind === "project"
                    ? item.kind
                    : null,
                entity_id: item.id,
                position_x: 0,
                position_y: 0,
                width: dims.width,
                height: dims.height,
                group_id: addItem.targetGroupId ?? addItem.sectionId ?? null,
                display_config:
                  item.kind === "doc"
                    ? {
                        title: (item as BlueprintDocItem).title,
                        content: (item as BlueprintDocItem).content,
                      }
                    : null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              mockNodes.push(newNode);
              addedNodes.push(newNode);
            }
          }

          const addedEdges: WorkspaceEdge[] = [];
          if (patch.addFlows) {
            for (const flow of patch.addFlows) {
              const edge: WorkspaceEdge = {
                id: `edge-${flow.fromItemId}-${flow.toItemId}`,
                workspace_id: patch.workspaceId,
                user_id: "mock-user",
                source_node_id: flow.fromItemId,
                target_node_id: flow.toItemId,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              mockEdges.push(edge);
              addedEdges.push(edge);
            }
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    result: {
                      workspaceId: patch.workspaceId,
                      addedNodes,
                      removedNodeIds,
                      updatedDocNodeIds,
                      addedEdges,
                      removedEdgeIds,
                    },
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        await ensureAuthenticated();
        const result = await applyWorkspacePatch(patch);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, result }, null, 2),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: getErrorMessage(err) }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
}
