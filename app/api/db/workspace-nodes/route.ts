import { NextRequest, NextResponse } from "next/server";
import { workspaceRepository } from "@/lib/db/repositories/workspace-repository";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (
      !body.workspace_id ||
      !body.kind ||
      body.position_x === undefined ||
      body.position_y === undefined
    ) {
      return NextResponse.json(
        {
          error: "workspace_id, kind, position_x, and position_y are required",
        },
        { status: 400 },
      );
    }
    const node = workspaceRepository.createNode(body);
    return NextResponse.json(node, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to create node";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.action === "batchUpdate") {
      if (!Array.isArray(body.nodes)) {
        return NextResponse.json(
          { error: "nodes array required for batchUpdate" },
          { status: 400 },
        );
      }
      workspaceRepository.batchUpdateNodes(body.nodes);
      return NextResponse.json({ success: true });
    }

    const { id, ...updates } = body;
    if (!id) {
      return NextResponse.json(
        { error: "Node ID is required" },
        { status: 400 },
      );
    }
    const node = workspaceRepository.updateNode(id, updates);
    if (!node)
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    return NextResponse.json(node);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to update node";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "Node ID is required" },
        { status: 400 },
      );
    }
    const success = workspaceRepository.deleteNode(id);
    return NextResponse.json({ success });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to delete node";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
