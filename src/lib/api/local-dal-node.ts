import "server-only";

import type { LocalDal } from "@/lib/api/local-dal";
import { getDatabase } from "@/lib/db";
import { calendarRepository } from "@/lib/db/repositories/calendar-repository";
import { focusRepository } from "@/lib/db/repositories/focus-repository";
import { habitRepository } from "@/lib/db/repositories/habit-repository";
import { projectRepository } from "@/lib/db/repositories/project-repository";
import { taskRepository } from "@/lib/db/repositories/task-repository";
import { visualRepository } from "@/lib/db/repositories/visual-repository";
import { workspaceRepository } from "@/lib/db/repositories/workspace-repository";

/**
 * Server/test implementation of the local DAL. Every method is a one-to-one
 * delegation to the SQLite repository singletons — no logic lives here.
 *
 * `server-only` makes an accidental client import fail loudly instead of
 * silently dragging `node:fs`/`better-sqlite3` into the browser bundle.
 */
export function createNodeLocalDal(): LocalDal {
  return {
    tasks: {
      list: (options) => taskRepository.list(options),
      getById: (id) => taskRepository.getById(id),
      create: (input) => taskRepository.create(input),
      update: (id, updates) => taskRepository.update(id, updates),
      toggleComplete: (id) => taskRepository.toggleComplete(id),
      delete: (id) => taskRepository.delete(id),
      reorder: (taskIds) => taskRepository.reorder(taskIds),
    },
    projects: {
      list: (userId) => projectRepository.list(userId),
      getById: (id) => projectRepository.getById(id),
      create: (input) => projectRepository.create(input),
      update: (id, updates) => projectRepository.update(id, updates),
      delete: (id) => projectRepository.delete(id),
    },
    habits: {
      list: (userId) => habitRepository.list(userId),
      getById: (id) => habitRepository.getById(id),
      create: (input) => habitRepository.create(input),
      update: (id, updates) => habitRepository.update(id, updates),
      delete: (id) => habitRepository.delete(id),
      recordEntry: (habitId, date, value) =>
        habitRepository.recordEntry(habitId, date, value),
      upsertEntry: (habitId, date, value) =>
        habitRepository.upsertEntry(habitId, date, value),
      deleteEntry: (habitId, date) =>
        habitRepository.deleteEntry(habitId, date),
      calculateStreak: (habitId) => habitRepository.calculateStreak(habitId),
    },
    focus: {
      list: (userId, limit) => focusRepository.list(userId, limit),
      getTotalFocusSeconds: (userId) =>
        focusRepository.getTotalFocusSeconds(userId),
      create: (input) => focusRepository.create(input),
      logSession: (input) => focusRepository.logSession(input),
    },
    calendar: {
      list: (options) => calendarRepository.list(options),
      getById: (id) => calendarRepository.getById(id),
      create: (input) => calendarRepository.create(input),
      update: (id, updates) => calendarRepository.update(id, updates),
      delete: (id) => calendarRepository.delete(id),
    },
    workspaces: {
      list: (userId) => workspaceRepository.listWorkspaces(userId),
      get: (id) => workspaceRepository.getWorkspace(id),
      create: (input) => workspaceRepository.createWorkspace(input),
      updateWorkspace: (id, updates) =>
        workspaceRepository.updateWorkspace(id, updates),
      deleteWorkspace: (id) => workspaceRepository.deleteWorkspace(id),
      createNode: (input) => workspaceRepository.createNode(input),
      updateNode: (id, updates) => workspaceRepository.updateNode(id, updates),
      batchUpdateNodes: (nodes) => workspaceRepository.batchUpdateNodes(nodes),
      deleteNode: (id) => workspaceRepository.deleteNode(id),
      createEdge: (input) => workspaceRepository.createEdge(input),
      deleteEdge: (id) => workspaceRepository.deleteEdge(id),
    },
    visual: {
      listAssets: (workspaceId, includeDeleted) =>
        visualRepository.listAssets(workspaceId, includeDeleted),
      getAsset: (assetId, includeDeleted) =>
        visualRepository.getAsset(assetId, includeDeleted),
      getVersion: (assetId, versionId) =>
        visualRepository.getVersion(assetId, versionId),
      readVersionBytes: (assetId, versionId) =>
        visualRepository.readVersionBytes(assetId, versionId),
      listVersions: (assetId) => visualRepository.listVersions(assetId),
      createAsset: (input) => visualRepository.createAsset(input),
      appendVersion: (input) => visualRepository.appendVersion(input),
      updateAsset: (asset) => visualRepository.updateAsset(asset),
      removeAsset: (assetId) => visualRepository.removeAsset(assetId),
      listAnnotations: (assetId, versionId) =>
        visualRepository.listAnnotations(assetId, versionId),
      putAnnotation: (annotation) => visualRepository.putAnnotation(annotation),
      removeAnnotation: (annotationId) =>
        visualRepository.removeAnnotation(annotationId),
      listDerived: (assetId, versionId) =>
        visualRepository.listDerived(assetId, versionId),
      putDerived: (derived) => visualRepository.putDerived(derived),
      listRelations: (workspaceId) =>
        visualRepository.listRelations(workspaceId),
      listAllRelations: () => visualRepository.listAllRelations(),
      putRelation: (relation) => visualRepository.putRelation(relation),
      removeRelation: (relationId) =>
        visualRepository.removeRelation(relationId),
      listDrafts: (workspaceId) => visualRepository.listDrafts(workspaceId),
      listAllDrafts: () => visualRepository.listAllDrafts(),
      getDraft: (draftId) => visualRepository.getDraft(draftId),
      putDraft: (draft) => visualRepository.putDraft(draft),
      clearAll: () => visualRepository.clearAll(),
    },
    maintenance: {
      clearDomainData: () => {
        getDatabase().exec(`
          DELETE FROM workspace_edges;
          DELETE FROM workspace_nodes;
          DELETE FROM workspaces;
          DELETE FROM visual_assets;
          DELETE FROM calendar_events;
          DELETE FROM focus_logs;
          DELETE FROM habit_entries;
          DELETE FROM habits;
          DELETE FROM tasks;
          DELETE FROM projects;
        `);
      },
    },
  };
}
