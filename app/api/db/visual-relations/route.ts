import { NextRequest, NextResponse } from "next/server";
import { visualRepository } from "@/lib/db/repositories/visual-repository";
import type { VisualRelation } from "@/lib/types/visual";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const all = searchParams.get("all") === "true";

    if (all) return NextResponse.json(visualRepository.listAllRelations());
    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 },
      );
    }
    return NextResponse.json(visualRepository.listRelations(workspaceId));
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to list relations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const relation = body.relation as VisualRelation | undefined;
    if (!relation?.id) {
      return NextResponse.json(
        { error: "relation record is required" },
        { status: 400 },
      );
    }
    return NextResponse.json(visualRepository.putRelation(relation), {
      status: 201,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to save relation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "Relation ID is required" },
        { status: 400 },
      );
    }
    visualRepository.removeRelation(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to delete relation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
