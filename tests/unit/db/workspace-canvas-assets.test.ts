import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { getDatabase, closeDatabase } from "@/lib/db/index";
import { WorkspaceRepository } from "@/lib/db/repositories/workspace-repository";
import { AssetService } from "@/lib/assets/asset-service";

describe("03: Workspace Canvas Nodes, Edges & Local Assets Vertical Slice", () => {
  let tempDir: string;
  let testDbPath: string;
  let testAssetsDir: string;
  let originalAssetEnv: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kagelin-ws-test-"));
    testDbPath = path.join(tempDir, "test.db");
    testAssetsDir = path.join(tempDir, "assets");
    originalAssetEnv = process.env.KAGELIN_ASSETS_PATH;
    process.env.KAGELIN_ASSETS_PATH = testAssetsDir;
  });

  afterEach(() => {
    closeDatabase();
    if (originalAssetEnv) {
      process.env.KAGELIN_ASSETS_PATH = originalAssetEnv;
    } else {
      delete process.env.KAGELIN_ASSETS_PATH;
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("persists workspace nodes and handles drag coordinate updates", () => {
    const db = getDatabase(testDbPath);
    const wsRepo = new WorkspaceRepository(db);

    const ws = wsRepo.createWorkspace({ name: "Design Canvas" });
    expect(ws.id).toBeDefined();

    const node1 = wsRepo.createNode({
      workspace_id: ws.id,
      kind: "task",
      position_x: 100,
      position_y: 150,
      width: 250,
      height: 120,
    });
    expect(node1.position_x).toBe(100);
    expect(node1.position_y).toBe(150);

    const node2 = wsRepo.createNode({
      workspace_id: ws.id,
      kind: "habit",
      position_x: 400,
      position_y: 150,
    });

    // Batch update coordinates (simulating canvas dragging)
    wsRepo.batchUpdateNodes([
      { id: node1.id, position_x: 120, position_y: 180 },
      { id: node2.id, position_x: 450, position_y: 200 },
    ]);

    const updatedWorkspace = wsRepo.getWorkspace(ws.id);
    const updatedN1 = updatedWorkspace?.nodes.find((n) => n.id === node1.id);
    const updatedN2 = updatedWorkspace?.nodes.find((n) => n.id === node2.id);

    expect(updatedN1?.position_x).toBe(120);
    expect(updatedN1?.position_y).toBe(180);
    expect(updatedN2?.position_x).toBe(450);
    expect(updatedN2?.position_y).toBe(200);
  });

  it("enforces foreign key cascade deletion of edges when a node is removed", () => {
    const db = getDatabase(testDbPath);
    const wsRepo = new WorkspaceRepository(db);

    const ws = wsRepo.createWorkspace({ name: "Flow Canvas" });
    const n1 = wsRepo.createNode({
      workspace_id: ws.id,
      kind: "step1",
      position_x: 0,
      position_y: 0,
    });
    const n2 = wsRepo.createNode({
      workspace_id: ws.id,
      kind: "step2",
      position_x: 200,
      position_y: 0,
    });

    const edge = wsRepo.createEdge({
      workspace_id: ws.id,
      source_node_id: n1.id,
      target_node_id: n2.id,
    });
    expect(edge.id).toBeDefined();

    let data = wsRepo.getWorkspace(ws.id);
    expect(data?.edges.length).toBe(1);

    // Deleting n1 must cascade-delete the connecting edge
    wsRepo.deleteNode(n1.id);

    data = wsRepo.getWorkspace(ws.id);
    expect(data?.nodes.length).toBe(1);
    expect(data?.edges.length).toBe(0);
  });

  it("cascades workspace deletion to all containing nodes and edges", () => {
    const db = getDatabase(testDbPath);
    const wsRepo = new WorkspaceRepository(db);

    const ws = wsRepo.createWorkspace({ name: "Temporary Canvas" });
    const n1 = wsRepo.createNode({
      workspace_id: ws.id,
      kind: "a",
      position_x: 0,
      position_y: 0,
    });
    const n2 = wsRepo.createNode({
      workspace_id: ws.id,
      kind: "b",
      position_x: 50,
      position_y: 50,
    });
    wsRepo.createEdge({
      workspace_id: ws.id,
      source_node_id: n1.id,
      target_node_id: n2.id,
    });

    wsRepo.deleteWorkspace(ws.id);

    const wsCount = (
      db
        .prepare("SELECT count(*) as c FROM workspaces WHERE id = ?")
        .get(ws.id) as any
    ).c;
    const nodeCount = (
      db
        .prepare(
          "SELECT count(*) as c FROM workspace_nodes WHERE workspace_id = ?",
        )
        .get(ws.id) as any
    ).c;
    const edgeCount = (
      db
        .prepare(
          "SELECT count(*) as c FROM workspace_edges WHERE workspace_id = ?",
        )
        .get(ws.id) as any
    ).c;

    expect(wsCount).toBe(0);
    expect(nodeCount).toBe(0);
    expect(edgeCount).toBe(0);
  });

  it("ingests binary assets to local disk named by SHA256 and retrieves correctly", () => {
    getDatabase(testDbPath);
    const assetService = new AssetService();

    const sampleBuffer = Buffer.from("fake-png-image-binary-data-12345");
    const asset = assetService.saveAsset(
      sampleBuffer,
      "diagram.png",
      "image/png",
      800,
      600,
    );

    expect(asset.id).toBeDefined();
    expect(asset.hash).toBeDefined();
    expect(asset.mime_type).toBe("image/png");
    expect(asset.file_size).toBe(sampleBuffer.length);
    expect(asset.width).toBe(800);
    expect(asset.height).toBe(600);

    // Verify file exists on disk
    const diskPath = path.join(testAssetsDir, asset.file_path);
    expect(fs.existsSync(diskPath)).toBe(true);

    // Read back through service
    const read = assetService.readAssetBytes(asset.hash);
    expect(read).not.toBeNull();
    expect(read?.buffer.toString()).toBe("fake-png-image-binary-data-12345");
  });
});
