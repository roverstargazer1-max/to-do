import { NextRequest, NextResponse } from "next/server";
import { workspaceRepository } from "@/lib/db/repositories/workspace-repository";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const userId = searchParams.get("userId") || "local_user";

    if (id) {
      const data = workspaceRepository.getWorkspace(id);
      if (!data)
        return NextResponse.json(
          { error: "Workspace not found" },
          { status: 404 },
        );
      return NextResponse.json(data);
    }

    const list = workspaceRepository.listWorkspaces(userId);
    return NextResponse.json(list);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to get workspaces";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.name) {
      return NextResponse.json(
        { error: "Workspace name is required" },
        { status: 400 },
      );
    }
    const ws = workspaceRepository.createWorkspace(body);
    return NextResponse.json(ws, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to create workspace";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) {
      return NextResponse.json(
        { error: "Workspace ID is required" },
        { status: 400 },
      );
    }
    const ws = workspaceRepository.updateWorkspace(id, updates);
    if (!ws)
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 },
      );
    return NextResponse.json(ws);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to update workspace";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "Workspace ID is required" },
        { status: 400 },
      );
    }
    const success = workspaceRepository.deleteWorkspace(id);
    return NextResponse.json({ success });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to delete workspace";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
