import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NextRequest } from "next/server";
import { closeDatabase } from "@/lib/db/index";
import {
  GET as getWorkspaces,
  POST as postWorkspaces,
} from "@/../app/api/db/workspaces/route";
import {
  POST as postNodes,
  PATCH as patchNodes,
} from "@/../app/api/db/workspace-nodes/route";
import { POST as postEdges } from "@/../app/api/db/workspace-edges/route";
import { POST as postAssets } from "@/../app/api/assets/route";
import { GET as getAssetByHash } from "@/../app/api/assets/[hash]/route";

describe("API Routes: Workspaces, Nodes, Edges, Assets", () => {
  let tempDir: string;
  let testDbPath: string;
  let testAssetsDir: string;
  let originalDbEnv: string | undefined;
  let originalAssetEnv: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kagelin-api-test3-"));
    testDbPath = path.join(tempDir, "data.db");
    testAssetsDir = path.join(tempDir, "assets");
    originalDbEnv = process.env.KAGELIN_DB_PATH;
    originalAssetEnv = process.env.KAGELIN_ASSETS_PATH;
    process.env.KAGELIN_DB_PATH = testDbPath;
    process.env.KAGELIN_ASSETS_PATH = testAssetsDir;
  });

  afterEach(() => {
    closeDatabase();
    if (originalDbEnv) process.env.KAGELIN_DB_PATH = originalDbEnv;
    else delete process.env.KAGELIN_DB_PATH;
    if (originalAssetEnv) process.env.KAGELIN_ASSETS_PATH = originalAssetEnv;
    else delete process.env.KAGELIN_ASSETS_PATH;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("handles workspace, node, edge, and asset streaming endpoints", async () => {
    // 1. Create workspace
    const wsReq = new NextRequest("http://localhost:3000/api/db/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: "Architecture Plan" }),
    });
    const wsRes = await postWorkspaces(wsReq);
    expect(wsRes.status).toBe(201);
    const ws = await wsRes.json();

    // 2. Create nodes
    const n1Req = new NextRequest(
      "http://localhost:3000/api/db/workspace-nodes",
      {
        method: "POST",
        body: JSON.stringify({
          workspace_id: ws.id,
          kind: "task",
          position_x: 50,
          position_y: 100,
        }),
      },
    );
    const n1Res = await postNodes(n1Req);
    expect(n1Res.status).toBe(201);
    const n1 = await n1Res.json();

    const n2Req = new NextRequest(
      "http://localhost:3000/api/db/workspace-nodes",
      {
        method: "POST",
        body: JSON.stringify({
          workspace_id: ws.id,
          kind: "note",
          position_x: 250,
          position_y: 100,
        }),
      },
    );
    const n2 = await (await postNodes(n2Req)).json();

    // 3. Connect nodes with edge
    const edgeReq = new NextRequest(
      "http://localhost:3000/api/db/workspace-edges",
      {
        method: "POST",
        body: JSON.stringify({
          workspace_id: ws.id,
          source_node_id: n1.id,
          target_node_id: n2.id,
        }),
      },
    );
    const edgeRes = await postEdges(edgeReq);
    expect(edgeRes.status).toBe(201);

    // 4. Batch update node positions
    const batchReq = new NextRequest(
      "http://localhost:3000/api/db/workspace-nodes",
      {
        method: "PATCH",
        body: JSON.stringify({
          action: "batchUpdate",
          nodes: [{ id: n1.id, position_x: 80, position_y: 120 }],
        }),
      },
    );
    const batchRes = await patchNodes(batchReq);
    expect(batchRes.status).toBe(200);

    // 5. Ingest asset
    const sampleBase64 = Buffer.from("test-pixel-data").toString("base64");
    const assetPostReq = new NextRequest("http://localhost:3000/api/assets", {
      method: "POST",
      body: JSON.stringify({
        base64: sampleBase64,
        fileName: "icon.png",
        mimeType: "image/png",
      }),
    });
    const assetPostRes = await postAssets(assetPostReq);
    expect(assetPostRes.status).toBe(201);
    const assetData = await assetPostRes.json();
    expect(assetData.hash).toBeDefined();

    // 6. Stream asset back
    const streamReq = new NextRequest(
      `http://localhost:3000/api/assets/${assetData.hash}`,
    );
    const streamRes = await getAssetByHash(streamReq, {
      params: Promise.resolve({ hash: assetData.hash }),
    });
    expect(streamRes.status).toBe(200);
    const blob = await streamRes.arrayBuffer();
    expect(Buffer.from(blob).toString()).toBe("test-pixel-data");
  });
});
