import type Database from "better-sqlite3";
import { getDatabase } from "../index";
import type {
  Workspace,
  WorkspaceNode,
  WorkspaceEdge,
} from "@/lib/types/workspace";

interface DbWorkspaceRow {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  created_at: string;
  updated_at: string;
}

interface DbNodeRow {
  id: string;
  workspace_id: string;
  user_id: string;
  kind: string;
  entity_type: string | null;
  entity_id: string | null;
  position_x: number;
  position_y: number;
  width: number | null;
  height: number | null;
  group_id: string | null;
  display_config: string | null;
  created_at: string;
  updated_at: string;
}

interface DbEdgeRow {
  id: string;
  workspace_id: string;
  user_id: string;
  source_node_id: string;
  target_node_id: string;
  created_at: string;
}

function mapWorkspace(row: DbWorkspaceRow): Workspace {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    color: row.color,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapNode(row: DbNodeRow): WorkspaceNode {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    kind: row.kind,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    position_x: row.position_x,
    position_y: row.position_y,
    width: row.width,
    height: row.height,
    group_id: row.group_id,
    display_config: row.display_config ? JSON.parse(row.display_config) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapEdge(row: DbEdgeRow): WorkspaceEdge {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    source_node_id: row.source_node_id,
    target_node_id: row.target_node_id,
    created_at: row.created_at,
    updated_at: row.created_at,
  };
}

export class WorkspaceRepository {
  constructor(private db?: Database.Database) {}

  private get connection(): Database.Database {
    return this.db || getDatabase();
  }

  listWorkspaces(userId = "local_user"): Workspace[] {
    const rows = this.connection
      .prepare(
        `SELECT * FROM workspaces WHERE user_id = ? ORDER BY created_at ASC`,
      )
      .all(userId) as DbWorkspaceRow[];
    return rows.map(mapWorkspace);
  }

  getWorkspace(id: string): {
    workspace: Workspace;
    nodes: WorkspaceNode[];
    edges: WorkspaceEdge[];
  } | null {
    const wsRow = this.connection
      .prepare(`SELECT * FROM workspaces WHERE id = ?`)
      .get(id) as DbWorkspaceRow | undefined;
    if (!wsRow) return null;

    const nodeRows = this.connection
      .prepare(
        `SELECT * FROM workspace_nodes WHERE workspace_id = ? ORDER BY created_at ASC`,
      )
      .all(id) as DbNodeRow[];

    const edgeRows = this.connection
      .prepare(
        `SELECT * FROM workspace_edges WHERE workspace_id = ? ORDER BY created_at ASC`,
      )
      .all(id) as DbEdgeRow[];

    return {
      workspace: mapWorkspace(wsRow),
      nodes: nodeRows.map(mapNode),
      edges: edgeRows.map(mapEdge),
    };
  }

  createWorkspace(input: {
    id?: string;
    user_id?: string;
    name: string;
    color?: string | null;
  }): Workspace {
    const id = input.id || crypto.randomUUID();
    const userId = input.user_id || "local_user";
    const now = new Date().toISOString();

    this.connection
      .prepare(
        `INSERT INTO workspaces (id, user_id, name, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, userId, input.name, input.color || null, now, now);

    const row = this.connection
      .prepare(`SELECT * FROM workspaces WHERE id = ?`)
      .get(id) as DbWorkspaceRow;
    return mapWorkspace(row);
  }

  updateWorkspace(
    id: string,
    updates: Partial<{ name: string; color: string | null }>,
  ): Workspace | null {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (updates.name !== undefined) {
      sets.push("name = ?");
      values.push(updates.name);
    }
    if (updates.color !== undefined) {
      sets.push("color = ?");
      values.push(updates.color);
    }

    if (sets.length === 0) return this.getWorkspace(id)?.workspace || null;

    sets.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);

    this.connection
      .prepare(`UPDATE workspaces SET ${sets.join(", ")} WHERE id = ?`)
      .run(...values);

    const row = this.connection
      .prepare(`SELECT * FROM workspaces WHERE id = ?`)
      .get(id) as DbWorkspaceRow | undefined;
    return row ? mapWorkspace(row) : null;
  }

  deleteWorkspace(id: string): boolean {
    const res = this.connection
      .prepare(`DELETE FROM workspaces WHERE id = ?`)
      .run(id);
    return res.changes > 0;
  }

  createNode(input: {
    id?: string;
    workspace_id: string;
    user_id?: string;
    kind: string;
    entity_type?: string | null;
    entity_id?: string | null;
    position_x: number;
    position_y: number;
    width?: number | null;
    height?: number | null;
    group_id?: string | null;
    display_config?: Record<string, unknown> | null;
  }): WorkspaceNode {
    const id = input.id || crypto.randomUUID();
    const userId = input.user_id || "local_user";
    const now = new Date().toISOString();

    this.connection
      .prepare(
        `INSERT INTO workspace_nodes (
          id, workspace_id, user_id, kind, entity_type, entity_id,
          position_x, position_y, width, height, group_id, display_config,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?
        )`,
      )
      .run(
        id,
        input.workspace_id,
        userId,
        input.kind,
        input.entity_type || null,
        input.entity_id || null,
        input.position_x,
        input.position_y,
        input.width ?? null,
        input.height ?? null,
        input.group_id ?? null,
        input.display_config ? JSON.stringify(input.display_config) : null,
        now,
        now,
      );

    const row = this.connection
      .prepare(`SELECT * FROM workspace_nodes WHERE id = ?`)
      .get(id) as DbNodeRow;
    return mapNode(row);
  }

  updateNode(
    id: string,
    updates: Partial<{
      position_x: number;
      position_y: number;
      width: number | null;
      height: number | null;
      group_id: string | null;
      display_config: Record<string, unknown> | null;
    }>,
  ): WorkspaceNode | null {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (updates.position_x !== undefined) {
      sets.push("position_x = ?");
      values.push(updates.position_x);
    }
    if (updates.position_y !== undefined) {
      sets.push("position_y = ?");
      values.push(updates.position_y);
    }
    if (updates.width !== undefined) {
      sets.push("width = ?");
      values.push(updates.width);
    }
    if (updates.height !== undefined) {
      sets.push("height = ?");
      values.push(updates.height);
    }
    if (updates.group_id !== undefined) {
      sets.push("group_id = ?");
      values.push(updates.group_id);
    }
    if (updates.display_config !== undefined) {
      sets.push("display_config = ?");
      values.push(
        updates.display_config ? JSON.stringify(updates.display_config) : null,
      );
    }

    if (sets.length === 0) {
      const row = this.connection
        .prepare(`SELECT * FROM workspace_nodes WHERE id = ?`)
        .get(id) as DbNodeRow | undefined;
      return row ? mapNode(row) : null;
    }

    sets.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);

    this.connection
      .prepare(`UPDATE workspace_nodes SET ${sets.join(", ")} WHERE id = ?`)
      .run(...values);

    const row = this.connection
      .prepare(`SELECT * FROM workspace_nodes WHERE id = ?`)
      .get(id) as DbNodeRow | undefined;
    return row ? mapNode(row) : null;
  }

  batchUpdateNodes(
    nodes: {
      id: string;
      position_x?: number;
      position_y?: number;
      width?: number;
      height?: number;
    }[],
  ): void {
    const now = new Date().toISOString();
    const stmt = this.connection.prepare(
      `UPDATE workspace_nodes
       SET position_x = COALESCE(?, position_x),
           position_y = COALESCE(?, position_y),
           width = COALESCE(?, width),
           height = COALESCE(?, height),
           updated_at = ?
       WHERE id = ?`,
    );

    const runBatch = this.connection.transaction(() => {
      for (const n of nodes) {
        stmt.run(
          n.position_x ?? null,
          n.position_y ?? null,
          n.width ?? null,
          n.height ?? null,
          now,
          n.id,
        );
      }
    });
    runBatch();
  }

  deleteNode(id: string): boolean {
    const res = this.connection
      .prepare(`DELETE FROM workspace_nodes WHERE id = ?`)
      .run(id);
    return res.changes > 0;
  }

  createEdge(input: {
    id?: string;
    workspace_id: string;
    user_id?: string;
    source_node_id: string;
    target_node_id: string;
  }): WorkspaceEdge {
    const id = input.id || crypto.randomUUID();
    const userId = input.user_id || "local_user";
    const now = new Date().toISOString();

    this.connection
      .prepare(
        `INSERT INTO workspace_edges (id, workspace_id, user_id, source_node_id, target_node_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(source_node_id, target_node_id) DO NOTHING`,
      )
      .run(
        id,
        input.workspace_id,
        userId,
        input.source_node_id,
        input.target_node_id,
        now,
      );

    const row = this.connection
      .prepare(
        `SELECT * FROM workspace_edges WHERE source_node_id = ? AND target_node_id = ?`,
      )
      .get(input.source_node_id, input.target_node_id) as DbEdgeRow;
    return mapEdge(row);
  }

  deleteEdge(id: string): boolean {
    const res = this.connection
      .prepare(`DELETE FROM workspace_edges WHERE id = ?`)
      .run(id);
    return res.changes > 0;
  }
}

export const workspaceRepository = new WorkspaceRepository();
