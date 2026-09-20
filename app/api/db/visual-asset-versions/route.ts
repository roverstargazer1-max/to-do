import { NextRequest, NextResponse } from "next/server";
import { visualRepository } from "@/lib/db/repositories/visual-repository";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get("assetId");
    const versionId = searchParams.get("versionId") ?? undefined;
    const list = searchParams.get("list") === "true";

    if (!assetId) {
      return NextResponse.json(
        { error: "assetId is required" },
        { status: 400 },
      );
    }

    if (list) {
      return NextResponse.json(visualRepository.listVersions(assetId));
    }

    const version = visualRepository.getVersion(assetId, versionId);
    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }
    return NextResponse.json(version);
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to read visual asset version";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
