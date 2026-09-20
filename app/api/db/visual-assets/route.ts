import { NextRequest, NextResponse } from "next/server";
import { visualRepository } from "@/lib/db/repositories/visual-repository";
import type { VisualAsset, VisualAssetVersion } from "@/lib/types/visual";

function decodeBytes(value: unknown): Uint8Array {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Visual asset bytes are required");
  }
  return new Uint8Array(Buffer.from(value, "base64"));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const workspaceId = searchParams.get("workspaceId") ?? undefined;
    const includeDeleted = searchParams.get("includeDeleted") === "true";

    if (id) {
      const asset = visualRepository.getAsset(id, includeDeleted);
      if (!asset) {
        return NextResponse.json(
          { error: "Visual asset not found" },
          { status: 404 },
        );
      }
      return NextResponse.json(asset);
    }

    return NextResponse.json(
      visualRepository.listAssets(workspaceId, includeDeleted),
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to list visual assets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.action === "clear") {
      visualRepository.clearAll();
      return NextResponse.json({ success: true });
    }

    if (body.action === "appendVersion") {
      const asset = body.asset as VisualAsset;
      const version = body.version as VisualAssetVersion;
      if (!asset?.id || !version?.id) {
        return NextResponse.json(
          { error: "asset and version records are required" },
          { status: 400 },
        );
      }
      const saved = visualRepository.appendVersion({
        asset,
        version,
        bytes: decodeBytes(body.bytesBase64),
      });
      return NextResponse.json(saved, { status: 201 });
    }

    const asset = body.asset as VisualAsset;
    const version = body.version as VisualAssetVersion;
    if (!asset?.id || !version?.id) {
      return NextResponse.json(
        { error: "asset and version records are required" },
        { status: 400 },
      );
    }
    const saved = visualRepository.createAsset({
      asset,
      version,
      bytes: decodeBytes(body.bytesBase64),
    });
    return NextResponse.json(saved, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to save visual asset";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const asset = body.asset as VisualAsset | undefined;
    if (!asset?.id) {
      return NextResponse.json(
        { error: "asset record is required" },
        { status: 400 },
      );
    }
    return NextResponse.json(visualRepository.updateAsset(asset));
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to update visual asset";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "Visual asset ID is required" },
        { status: 400 },
      );
    }
    visualRepository.removeAsset(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to delete visual asset";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
