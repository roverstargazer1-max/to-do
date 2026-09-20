import { NextRequest, NextResponse } from "next/server";
import { visualRepository } from "@/lib/db/repositories/visual-repository";
import type { VisualFlowDraft } from "@/lib/types/visual";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const workspaceId = searchParams.get("workspaceId");
    const all = searchParams.get("all") === "true";

    if (id) {
      const draft = visualRepository.getDraft(id);
      if (!draft) {
        return NextResponse.json({ error: "Draft not found" }, { status: 404 });
      }
      return NextResponse.json(draft);
    }

    if (all) return NextResponse.json(visualRepository.listAllDrafts());
    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 },
      );
    }
    return NextResponse.json(visualRepository.listDrafts(workspaceId));
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to list flow drafts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const draft = body.draft as VisualFlowDraft | undefined;
    if (!draft?.id) {
      return NextResponse.json(
        { error: "draft record is required" },
        { status: 400 },
      );
    }
    return NextResponse.json(visualRepository.putDraft(draft), { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to save flow draft";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
