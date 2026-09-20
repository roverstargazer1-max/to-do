import { NextRequest, NextResponse } from "next/server";
import { visualRepository } from "@/lib/db/repositories/visual-repository";
import type { VisualAnnotation } from "@/lib/types/visual";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get("assetId");
    const versionId = searchParams.get("versionId") ?? undefined;
    if (!assetId) {
      return NextResponse.json(
        { error: "assetId is required" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      visualRepository.listAnnotations(assetId, versionId),
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to list annotations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const annotation = body.annotation as VisualAnnotation | undefined;
    if (!annotation?.id) {
      return NextResponse.json(
        { error: "annotation record is required" },
        { status: 400 },
      );
    }
    return NextResponse.json(visualRepository.putAnnotation(annotation), {
      status: 201,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to save annotation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "Annotation ID is required" },
        { status: 400 },
      );
    }
    visualRepository.removeAnnotation(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to delete annotation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
