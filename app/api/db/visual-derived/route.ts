import { NextRequest, NextResponse } from "next/server";
import { visualRepository } from "@/lib/db/repositories/visual-repository";
import type { VisualDerivedInfo } from "@/lib/types/visual";

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
    return NextResponse.json(visualRepository.listDerived(assetId, versionId));
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to list derived info";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const derived = body.derived as VisualDerivedInfo | undefined;
    if (!derived?.id) {
      return NextResponse.json(
        { error: "derived record is required" },
        { status: 400 },
      );
    }
    return NextResponse.json(visualRepository.putDerived(derived), {
      status: 201,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to save derived info";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
