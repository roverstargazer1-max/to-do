import { z } from "zod";
import type { NodePosition } from "@/lib/types/workspace";

/**
 * Semantic Workspace Blueprint Schema & Compiled Layout Types
 * (Parent: .scratch/workspace-ai-builder/spec.md)
 */

export interface BlueprintDocItem {
  id: string;
  kind: "doc";
  title: string;
  content: string; // Markdown text
}

export interface BlueprintTaskItem {
  id: string;
  kind: "task";
  content: string;
  priority?: 1 | 2 | 3 | 4;
  dueDate?: string;
  projectName?: string; // Links to existing or creates new project
  existingTaskId?: string; // Reuses an existing task if specified
}

export interface BlueprintHabitItem {
  id: string;
  kind: "habit";
  name: string;
  color?: string;
  existingHabitId?: string; // Reuses an existing habit if specified
}

export interface BlueprintProjectItem {
  id: string;
  kind: "project";
  name: string;
  color?: string;
  existingProjectId?: string; // Reuses an existing project if specified
}

export interface BlueprintFocusItem {
  id: string;
  kind: "focus";
}

export type BlueprintItem =
  | BlueprintDocItem
  | BlueprintTaskItem
  | BlueprintHabitItem
  | BlueprintProjectItem
  | BlueprintFocusItem;

export type BlueprintItemKind = BlueprintItem["kind"];

export interface BlueprintFlow {
  fromItemId: string;
  toItemId: string;
}

export interface BlueprintSection {
  id: string;
  title: string;
  color?: string;
  isGroup?: boolean; // When true, rendered as a Group container node
  items: BlueprintItem[];
}

export interface WorkspaceBlueprint {
  name: string;
  color?: string;
  sections: BlueprintSection[];
  flows?: BlueprintFlow[];
}

// ==========================================
// Compiled Layout Data Structures
// ==========================================

export interface CompiledLayoutNode {
  id: string;
  kind: string;
  position: NodePosition;
  width: number;
  height: number;
  groupId?: string | null;
  sectionId?: string;
  title?: string;
  color?: string;
  item?: BlueprintItem;
}

export interface CompiledLayoutEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
}

export interface CompiledLayoutBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface CompiledBlueprintLayout {
  nodes: CompiledLayoutNode[];
  edges: CompiledLayoutEdge[];
  bounds: CompiledLayoutBounds;
}

// ==========================================
// Semantic Patching Schema
// ==========================================

export interface AddPatchItem {
  sectionId?: string;
  targetGroupId?: string;
  item: BlueprintItem;
}

export interface UpdateDocPatch {
  nodeId: string;
  title?: string;
  content?: string;
}

export interface BlueprintPatch {
  workspaceId: string;
  addItems?: AddPatchItem[];
  removeNodeIds?: string[];
  updateDocs?: UpdateDocPatch[];
  addFlows?: BlueprintFlow[];
  removeEdgeIds?: string[];
}

// ==========================================
// Zod Runtime Validation Schemas
// ==========================================

export const BlueprintDocItemSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("doc"),
  title: z.string(),
  content: z.string(),
});

export const BlueprintTaskItemSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("task"),
  content: z.string().min(1),
  priority: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .optional(),
  dueDate: z.string().optional(),
  projectName: z.string().optional(),
  existingTaskId: z.string().optional(),
});

export const BlueprintHabitItemSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("habit"),
  name: z.string().min(1),
  color: z.string().optional(),
  existingHabitId: z.string().optional(),
});

export const BlueprintProjectItemSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("project"),
  name: z.string().min(1),
  color: z.string().optional(),
  existingProjectId: z.string().optional(),
});

export const BlueprintFocusItemSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("focus"),
});

export const BlueprintItemSchema = z.discriminatedUnion("kind", [
  BlueprintDocItemSchema,
  BlueprintTaskItemSchema,
  BlueprintHabitItemSchema,
  BlueprintProjectItemSchema,
  BlueprintFocusItemSchema,
]);

export const BlueprintFlowSchema = z.object({
  fromItemId: z.string().min(1),
  toItemId: z.string().min(1),
});

export const BlueprintSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  color: z.string().optional(),
  isGroup: z.boolean().optional(),
  items: z.array(BlueprintItemSchema),
});

export const WorkspaceBlueprintSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
  sections: z.array(BlueprintSectionSchema),
  flows: z.array(BlueprintFlowSchema).optional(),
});

export const AddPatchItemSchema = z.object({
  sectionId: z.string().optional(),
  targetGroupId: z.string().optional(),
  item: BlueprintItemSchema,
});

export const UpdateDocPatchSchema = z.object({
  nodeId: z.string().min(1),
  title: z.string().optional(),
  content: z.string().optional(),
});

export const BlueprintPatchSchema = z.object({
  workspaceId: z.string().min(1),
  addItems: z.array(AddPatchItemSchema).optional(),
  removeNodeIds: z.array(z.string()).optional(),
  updateDocs: z.array(UpdateDocPatchSchema).optional(),
  addFlows: z.array(BlueprintFlowSchema).optional(),
  removeEdgeIds: z.array(z.string()).optional(),
});
