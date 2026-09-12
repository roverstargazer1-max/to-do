import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Guest workspace persistence (ADR 0018): IndexedDB under its own key,
 * never the mockStore localStorage blob. idb-keyval is mocked to a plain
 * in-memory map so the test observes which key the store writes and what
 * it round-trips — the externally visible contract.
 */
const idbBacking = new Map<string, unknown>();

vi.mock("idb-keyval", () => ({
  get: vi.fn(async (key: string) => idbBacking.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    idbBacking.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    idbBacking.delete(key);
  }),
}));

import { guestWorkspaceStore } from "@/lib/workspace/guest-store";
import type { WorkspaceNode } from "@/lib/types/workspace";

const makeNode = (
  id: string,
  workspaceId: string,
  extra: Partial<WorkspaceNode> = {},
): WorkspaceNode => ({
  id,
  workspace_id: workspaceId,
  user_id: "guest",
  kind: "task",
  entity_type: "task",
  entity_id: `task-${id}`,
  position_x: 0,
  position_y: 0,
  width: null,
  height: null,
  display_config: null,
  created_at: "2026-09-09T00:00:00.000Z",
  updated_at: "2026-09-09T00:00:00.000Z",
  ...extra,
});

describe("guestWorkspaceStore", () => {
  beforeEach(async () => {
    idbBacking.clear();
    // Drop the module-level in-memory snapshot so each test starts cold.
    await guestWorkspaceStore.clear();
  });

  it("persists workspaces under their own IndexedDB key, never the mockStore blob", async () => {
    await guestWorkspaceStore.createWorkspace({ id: "ws-1", name: "Plan" });

    expect(idbBacking.has("kanso-guest-workspaces")).toBe(true);
    expect(idbBacking.has("kanso_guest_data_v11")).toBe(false);
  });

  it("round-trips created workspaces on a fresh store instance (reload)", async () => {
    await guestWorkspaceStore.createWorkspace({ id: "ws-1", name: "One" });
    await guestWorkspaceStore.createWorkspace({ id: "ws-2", name: "Two" });

    // The in-memory cache is reset; reads fall through to IndexedDB.
    await guestWorkspaceStore.clear();

    const list = await guestWorkspaceStore.listWorkspaces();
    expect(list.map((w) => w.id)).toEqual(["ws-1", "ws-2"]);
    expect(list.map((w) => w.name)).toEqual(["One", "Two"]);
  });

  it("renames a workspace and throws for an unknown id", async () => {
    await guestWorkspaceStore.createWorkspace({ id: "ws-1", name: "Old" });

    const renamed = await guestWorkspaceStore.renameWorkspace("ws-1", "New");
    expect(renamed.name).toBe("New");

    await expect(
      guestWorkspaceStore.renameWorkspace("nope", "x"),
    ).rejects.toThrow("Workspace not found");
  });

  it("deleting a workspace hard-cascades its nodes but leaves other workspaces' nodes alone", async () => {
    await guestWorkspaceStore.createWorkspace({ id: "ws-1", name: "One" });
    await guestWorkspaceStore.createWorkspace({ id: "ws-2", name: "Two" });

    const data = {
      workspaces: [
        {
          id: "ws-1",
          user_id: "guest",
          name: "One",
          created_at: "2026-09-09T00:00:00.000Z",
          updated_at: "2026-09-09T00:00:00.000Z",
        },
        {
          id: "ws-2",
          user_id: "guest",
          name: "Two",
          created_at: "2026-09-09T00:00:00.000Z",
          updated_at: "2026-09-09T00:00:00.000Z",
        },
      ],
      nodes: [
        makeNode("n-1", "ws-1"),
        makeNode("n-2", "ws-1"),
        makeNode("n-3", "ws-2"),
      ],
    };
    idbBacking.set("kanso-guest-workspaces", data);
    await guestWorkspaceStore.clear();

    await guestWorkspaceStore.deleteWorkspace("ws-1");

    const remaining = await guestWorkspaceStore.listWorkspaces();
    expect(remaining.map((w) => w.id)).toEqual(["ws-2"]);

    const nodesLeft = await guestWorkspaceStore.listNodes("ws-2");
    expect(nodesLeft.map((n) => n.id)).toEqual(["n-3"]);

    const nodesGone = await guestWorkspaceStore.listNodes("ws-1");
    expect(nodesGone).toEqual([]);
  });

  it("listNodes returns workspace-scoped copies (mutation-safe)", async () => {
    await guestWorkspaceStore.createWorkspace({ id: "ws-1", name: "One" });
    idbBacking.set("kanso-guest-workspaces", {
      workspaces: [],
      nodes: [makeNode("n-1", "ws-1", { position_x: 42 })],
    });
    await guestWorkspaceStore.clear();

    const nodes = await guestWorkspaceStore.listNodes("ws-1");
    nodes[0].position_x = 999;

    const reread = await guestWorkspaceStore.listNodes("ws-1");
    expect(reread[0].position_x).toBe(42);
  });

  describe("backup round-trip (ticket 09)", () => {
    const makeWorkspace = (id: string, name: string) => ({
      id,
      user_id: "guest",
      name,
      created_at: "2026-09-09T00:00:00.000Z",
      updated_at: "2026-09-09T00:00:00.000Z",
    });

    it("listAllNodes returns every row across workspaces, as copies", async () => {
      idbBacking.set("kanso-guest-workspaces", {
        workspaces: [
          makeWorkspace("ws-1", "One"),
          makeWorkspace("ws-2", "Two"),
        ],
        nodes: [
          makeNode("n-1", "ws-1"),
          makeNode("n-2", "ws-2", {
            position_x: 7,
          }),
        ],
      });
      await guestWorkspaceStore.clear();

      const nodes = await guestWorkspaceStore.listAllNodes();
      nodes[0].position_x = 999;

      expect(nodes.map((n) => n.id)).toEqual(["n-1", "n-2"]);
      // Copy semantics: the export view never aliases the snapshot.
      const reread = await guestWorkspaceStore.listAllNodes();
      expect(reread[0].position_x).toBe(0);
      expect(reread[1].position_x).toBe(7);
    });

    it("restoreBackup overwrites verbatim: row ids, placement, display config preserved", async () => {
      await guestWorkspaceStore.createWorkspace({ id: "old", name: "Old" });
      await guestWorkspaceStore.addNode({
        id: "old-node",
        workspaceId: "old",
        kind: "task",
        entityType: "task",
        entityId: "t-1",
        positionX: 0,
        positionY: 0,
        width: 240,
        height: null,
        displayConfig: { collapsed: true },
      });

      const workspaces = [makeWorkspace("ws-1", "Restored")];
      const nodes = [
        makeNode("n-1", "ws-1", {
          position_x: 128,
          position_y: 64,
          width: 300,
          display_config: { collapsed: false },
        }),
      ];
      await guestWorkspaceStore.restoreBackup(workspaces, nodes);

      // Overwrite, not merge: the old rows are gone.
      const list = await guestWorkspaceStore.listWorkspaces();
      expect(list).toEqual([
        expect.objectContaining({ id: "ws-1", name: "Restored" }),
      ]);
      const restoredNodes = await guestWorkspaceStore.listNodes("ws-1");
      // Verbatim: ids and placement survive, the Backup convention.
      expect(restoredNodes).toEqual([expect.objectContaining(nodes[0])]);

      // Survives a reload (cache dropped, reads fall to IndexedDB).
      await guestWorkspaceStore.clear();
      expect(await guestWorkspaceStore.listWorkspaces()).toEqual([
        expect.objectContaining({ id: "ws-1" }),
      ]);
    });

    it("repeat round-trips converge: exporting what restore wrote reads it back identically", async () => {
      const workspaces = [makeWorkspace("ws-1", "One")];
      const nodes = [
        makeNode("n-1", "ws-1", { position_x: 12, position_y: 34 }),
      ];
      await guestWorkspaceStore.restoreBackup(workspaces, nodes);

      // Export (the backup builder's view)…
      const exported = {
        workspaces: await guestWorkspaceStore.listWorkspaces(),
        workspace_nodes: await guestWorkspaceStore.listAllNodes(),
      };
      // …restore what was exported…
      await guestWorkspaceStore.restoreBackup(
        exported.workspaces,
        exported.workspace_nodes,
      );
      await guestWorkspaceStore.clear();
      // …and the canvas is the same canvas.
      expect(await guestWorkspaceStore.listWorkspaces()).toEqual([
        expect.objectContaining({ id: "ws-1", name: "One" }),
      ]);
      expect(await guestWorkspaceStore.listNodes("ws-1")).toEqual([
        expect.objectContaining({ id: "n-1", position_x: 12, position_y: 34 }),
      ]);
    });

    it("restoreBackup with absent sections (a pre-workspace backup) empties the canvas", async () => {
      await guestWorkspaceStore.createWorkspace({ id: "ws-1", name: "One" });

      await guestWorkspaceStore.restoreBackup([], []);

      expect(await guestWorkspaceStore.listWorkspaces()).toEqual([]);
      expect(await guestWorkspaceStore.listNodes("ws-1")).toEqual([]);
    });

    it("clearAll drops the persisted key and the snapshot — Start fresh is actually fresh", async () => {
      await guestWorkspaceStore.createWorkspace({ id: "ws-1", name: "One" });

      await guestWorkspaceStore.clearAll();

      expect(idbBacking.has("kanso-guest-workspaces")).toBe(false);
      expect(await guestWorkspaceStore.listWorkspaces()).toEqual([]);
      expect(await guestWorkspaceStore.listAllNodes()).toEqual([]);
    });
  });

  describe("grouping and size persistence", () => {
    const insertNode = async (
      id: string,
      workspaceId: string,
      overrides: Partial<WorkspaceNode> = {},
    ) => {
      return guestWorkspaceStore.addNode({
        id,
        workspaceId,
        kind: overrides.kind ?? "task",
        entityType: overrides.entity_type ?? "task",
        entityId: overrides.entity_id ?? `task-${id}`,
        positionX: overrides.position_x ?? 0,
        positionY: overrides.position_y ?? 0,
        width: overrides.width ?? null,
        height: overrides.height ?? null,
        groupId: overrides.group_id ?? null,
        displayConfig:
          (overrides.display_config as Record<string, unknown>) ?? null,
      });
    };

    it("updateNodeSize persists width and height", async () => {
      await guestWorkspaceStore.createWorkspace({ id: "ws-1", name: "One" });
      await insertNode("n-1", "ws-1");

      await guestWorkspaceStore.updateNodeSize("n-1", {
        width: 350,
        height: 220,
      });

      const nodes = await guestWorkspaceStore.listNodes("ws-1");
      expect(nodes[0].width).toBe(350);
      expect(nodes[0].height).toBe(220);
    });

    it("createGroup persists container and updates member coordinates to relative", async () => {
      await guestWorkspaceStore.createWorkspace({ id: "ws-1", name: "One" });
      await insertNode("n-1", "ws-1", { position_x: 100, position_y: 100 });
      await insertNode("n-2", "ws-1", { position_x: 200, position_y: 150 });

      const groupNode: WorkspaceNode = {
        id: "g-1",
        workspace_id: "ws-1",
        user_id: "guest",
        kind: "group",
        entity_type: null,
        entity_id: null,
        position_x: 80,
        position_y: 80,
        width: 400,
        height: 300,
        group_id: null,
        display_config: { title: "Sprint" },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await guestWorkspaceStore.createGroup({
        groupNode,
        members: [
          { id: "n-1", position_x: 20, position_y: 20, group_id: "g-1" },
          { id: "n-2", position_x: 120, position_y: 70, group_id: "g-1" },
        ],
      });

      const nodes = await guestWorkspaceStore.listNodes("ws-1");
      const group = nodes.find((n) => n.id === "g-1")!;
      const member1 = nodes.find((n) => n.id === "n-1")!;
      const member2 = nodes.find((n) => n.id === "n-2")!;

      expect(group).toBeDefined();
      expect(group.kind).toBe("group");
      expect(member1.group_id).toBe("g-1");
      expect(member1.position_x).toBe(20);
      expect(member2.group_id).toBe("g-1");
      expect(member2.position_x).toBe(120);
    });

    it("ungroup removes container and restores members to absolute coordinates", async () => {
      await guestWorkspaceStore.createWorkspace({ id: "ws-1", name: "One" });
      await insertNode("g-1", "ws-1", {
        kind: "group",
        entity_type: null,
        entity_id: null,
        position_x: 80,
        position_y: 80,
        width: 400,
        height: 300,
        display_config: { title: "Sprint" },
      });
      await insertNode("n-1", "ws-1", {
        group_id: "g-1",
        position_x: 20,
        position_y: 20,
      });

      await guestWorkspaceStore.ungroup({
        groupId: "g-1",
        members: [{ id: "n-1", position_x: 100, position_y: 100 }],
      });

      const nodes = await guestWorkspaceStore.listNodes("ws-1");
      expect(nodes.find((n) => n.id === "g-1")).toBeUndefined();
      const member = nodes.find((n) => n.id === "n-1")!;
      expect(member.group_id).toBeNull();
      expect(member.position_x).toBe(100);
      expect(member.position_y).toBe(100);
    });

    it("updateGroupTitle updates display_config.title", async () => {
      await guestWorkspaceStore.createWorkspace({ id: "ws-1", name: "One" });
      await insertNode("g-1", "ws-1", {
        kind: "group",
        entity_type: null,
        entity_id: null,
        position_x: 0,
        position_y: 0,
        width: 300,
        height: 200,
        display_config: { title: "Old Title" },
      });

      await guestWorkspaceStore.updateGroupTitle("g-1", "Renamed Title");

      const nodes = await guestWorkspaceStore.listNodes("ws-1");
      expect((nodes[0].display_config as { title: string })?.title).toBe(
        "Renamed Title",
      );
    });

    it("auto-dissolves group container when its last member is removed", async () => {
      await guestWorkspaceStore.createWorkspace({ id: "ws-1", name: "One" });
      await insertNode("g-1", "ws-1", {
        kind: "group",
        entity_type: null,
        entity_id: null,
        position_x: 0,
        position_y: 0,
        width: 300,
        height: 200,
        display_config: { title: "Solo Group" },
      });
      await insertNode("n-1", "ws-1", { group_id: "g-1" });

      // Before removal, there are 2 nodes (group + member)
      expect((await guestWorkspaceStore.listNodes("ws-1")).length).toBe(2);

      // Removing the only member
      await guestWorkspaceStore.removeNode("n-1");

      const nodes = await guestWorkspaceStore.listNodes("ws-1");
      // Both the member and the auto-dissolved empty group container are gone
      expect(nodes.length).toBe(0);
    });
  });
});
