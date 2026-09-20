import { NextRequest, NextResponse } from "next/server";
import { workspaceRepository } from "@/lib/db/repositories/workspace-repository";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.workspace_id || !body.source_node_id || !body.target_node_id) {
      return NextResponse.json(
        {
          error:
            "workspace_id, source_node_id, and target_node_id are required",
        },
        { status: 400 },
      );
    }
    const edge = workspaceRepository.createEdge(body);
    return NextResponse.json(edge, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to create edge";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "Edge ID is required" },
        { status: 400 },
      );
    }
    const success = workspaceRepository.deleteEdge(id);
    return NextResponse.json({ success });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to delete edge";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
